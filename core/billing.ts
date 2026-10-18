import { createHash } from 'node:crypto';
import type { Bill } from './types.js';
export type { Bill } from './types.js';
const invalid = () => new Error('账单 CSV 格式无效。请使用模板，日期为 YYYY-MM-DD，金额最多两位小数，币种 USD/CNY。');
export function validateBill(v: Bill): Bill {
  if (!v || !/^[a-f0-9]{64}$/.test(v.id) || typeof v.accountId !== 'string' || !/^[A-Za-z0-9-]{8,80}$/.test(v.accountId) || typeof v.accountLabel !== 'string' || v.accountLabel.length > 80 || typeof v.invoiceId !== 'string' || !v.invoiceId.trim() || v.invoiceId.length > 160 || typeof v.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || !Number.isFinite(Date.parse(v.date+'T00:00:00Z')) || new Date(v.date+'T00:00:00Z').toISOString().slice(0,10) !== v.date || !Number.isSafeInteger(v.amountCents) || Math.abs(v.amountCents)>1e12 || !['USD','CNY'].includes(v.currency) || typeof v.description !== 'string' || v.description.length>500 || v.source!=='csv' || typeof v.fileName !== 'string' || v.fileName.length>200 || !Number.isSafeInteger(v.importedAt) || v.importedAt<0 || v.importedAt>8640000000000000) throw invalid();
  if (v.id !== createHash('sha256').update(JSON.stringify([v.accountId,v.invoiceId])).digest('hex')) throw invalid();
  return v;
}
function csv(text: string) {
  const rows: string[][]=[], row: string[]=[]; let cell='',quoted=false,ended=false;
  const next=()=>{row.push(cell);cell='';ended=false;}; const line=()=>{next();if(row.some(c=>c!==''))rows.push([...row]);row.length=0;};
  for(let i=0;i<text.length;i++) {const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;ended=true;}}else cell+=c;}else if(c==='"'){if(cell || ended)throw invalid();quoted=true;}else if(c===',')next();else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;line();}else{if(ended)throw invalid();cell+=c;}}
  if(quoted)throw invalid();line();return rows;
}
export const BILL_TEMPLATE='invoice_id,date,amount,currency,description\r\n';
export function parseBills(text: string, accountId: string, accountLabel: string, fileName: string, now=Date.now()): Bill[] {
  if(typeof text!=='string'||Buffer.byteLength(text)>1024*1024)throw invalid();
  const rows=csv(text.replace(/^\uFEFF/,'')); if(rows.shift()?.join(',')!=='invoice_id,date,amount,currency,description'||!rows.length||rows.length>10000)throw invalid();
  const bills=rows.map(r=>{if(r.length!==5||! /^-?\d{1,10}(?:\.\d{1,2})?$/.test(r[2]))throw invalid();const negative=r[2].startsWith('-'),[whole,fraction='']=r[2].replace(/^-/,'').split('.');const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
    const invoiceId=r[0].trim();return validateBill({id:createHash('sha256').update(JSON.stringify([accountId,invoiceId])).digest('hex'),accountId,accountLabel,invoiceId,date:r[1],amountCents:negative?-cents:cents,currency:r[3] as Bill['currency'],description:r[4],source:'csv',fileName,importedAt:now});});
  return bills;
}
export function mergeBills(existing: Bill[], incoming: Bill[]) {
  const rows=new Map(existing.map(b=>[b.id,b])); let added=0,duplicates=0;
  for(const bill of incoming){validateBill(bill);const previous=rows.get(bill.id);if(previous){if(['date','amountCents','currency','description'].some(k=>(previous as any)[k] !== (bill as any)[k]))throw new Error('同一账单编号存在冲突，整批未导入。请核对账单编号或先删除原记录。');duplicates++;}else{rows.set(bill.id,bill);added++;}}
  if(rows.size>10000)throw new Error('账单记录超过 10000 条，请先整理历史记录。');
  return {bills:[...rows.values()],added,duplicates};
}
