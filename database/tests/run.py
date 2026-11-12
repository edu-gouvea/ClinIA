#!/usr/bin/env python3
"""Testes reais em banco descartável. Python 3 + Docker; nenhuma biblioteca externa."""
import argparse
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--container', required=True, help='Container PostgreSQL de desenvolvimento')
args = p.parse_args()
name = 'clinia_test_' + uuid.uuid4().hex
base = ['docker', '--host=unix:///var/run/docker.sock', 'exec', '-i', args.container, 'psql', '-X', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1']

def sql(statement, database=name, check=True):
    result = subprocess.run(base + ['-d', database], input=statement, text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result

sql(f'CREATE DATABASE {name};', database='postgres')
try:
    for file in ['schema.sql', 'seed.sql', 'tests/integrity.sql']:
        result = sql((ROOT / file).read_text())
        print(f'PASS {file}', flush=True)
        if file.endswith('integrity.sql'):
            print(result.stdout, flush=True)
    # Duas transações concorrentes tentam reservar o mesmo horário.
    insert = """INSERT INTO clinia.calendar_entries
    (clinic_id,professional_id,patient_id,specialty_id,kind,starts_at,ends_at,status)
    VALUES ('00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000007',
    'appointment','2030-11-04 15:00-03','2030-11-04 15:30-03','agendada');"""
    first = subprocess.Popen(base + ['-d', name], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    first.stdin.write('BEGIN; ' + insert + " SELECT 'reservation-held'; SELECT pg_sleep(2); COMMIT;\n")
    first.stdin.close()
    # Wait for the first INSERT acknowledgement; no timing assumption about DB startup.
    while True:
        line = first.stdout.readline()
        if not line:
            raise RuntimeError('Primeira transação encerrou antes da reserva: ' + first.stderr.read())
        if line.startswith('INSERT'):
            break
    second = sql('\\set VERBOSITY verbose\n' + insert, check=False)
    first.wait(timeout=15)
    if first.returncode != 0 or second.returncode == 0 or '23P01' not in second.stderr:
        raise RuntimeError('Concorrência não retornou exclusion_violation: ' + second.stderr)
    count = sql("SELECT count(*) FROM clinia.calendar_entries WHERE starts_at='2030-11-04 15:00-03';")
    if '\n     1\n' not in count.stdout:
        raise RuntimeError('Quantidade inesperada após concorrência: ' + count.stdout)
    print('PASS concorrência: uma reserva confirmada, outra rejeitada com SQLSTATE 23P01', flush=True)
finally:
    sql(f'DROP DATABASE {name} WITH (FORCE);', database='postgres')
    print('Banco descartável removido.', flush=True)
