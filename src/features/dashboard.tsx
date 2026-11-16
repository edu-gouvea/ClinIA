'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDemo } from '@/components/demo-provider';
import { addDays } from '@/lib/date';
import { getMetrics, getPeriod } from '@/lib/metrics';
import { HomeOverview } from './home-operations';
import { ManagementOverview } from './management-overview';

/** Shared period/filter parsing for Início and Visão gerencial. */
export function Dashboard({management=false}:{management?:boolean}){
 const {state}=useDemo();const router=useRouter();const params=useSearchParams();const rawDays=Number(params.get('period')||7);const days=[1,7,30].includes(rawDays)?rawDays:7;
 const professionalId=params.get('professional')||'';const specialty=params.get('specialty')||'';
 const period=getPeriod(state.referenceDate,days);const previous={start:addDays(period.start,-days),end:addDays(period.end,-days)};const metrics=getMetrics(state,period,professionalId,specialty);const before=getMetrics(state,previous,professionalId,specialty);
 function filter(key:string,value:string){const next=new URLSearchParams(params.toString());if(value)next.set(key,value);else next.delete(key);const url=`${management?'/gestao/visao-gerencial':'/inicio'}?${next}`;
 // Início: update the URL in place (Next integrates pushState with useSearchParams), so the
 // indicators change immediately without a navigation or a jump to the top. Back still works.
 if(management)router.push(url);else window.history.pushState(null,'',url);}
 if(management)return <ManagementOverview state={state} period={period} previous={previous} metrics={metrics} before={before} days={days} professionalId={professionalId} specialty={specialty}/>;
 return <HomeOverview state={state} period={period} previous={previous} metrics={metrics} before={before} days={days} professionalId={professionalId} specialty={specialty} onPeriod={value=>filter('period',value)}/>;
}
