export const count = (value: number | null) => value == null ? '未记录' : value.toLocaleString('zh-CN');
export const money = (value: number | null) => value == null ? '未记录' : `$${value === 0 ? '0' : value.toFixed(5)}`;
export const time = (value: string) => Number.isNaN(Date.parse(value)) ? '未记录' : new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
export function Status({ value }: { value: string }) {
  return <span className={`status ${value === 'ERROR' ? 'bad' : value === 'OK' ? 'good' : ''}`}><span />{value === 'OK' ? '成功' : value === 'ERROR' ? '错误' : value}</span>;
}
