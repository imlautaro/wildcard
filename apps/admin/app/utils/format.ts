const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const number = new Intl.NumberFormat();

export const formatDate = (value: number) => date.format(value);
export const formatDateTime = (value: number) => dateTime.format(value);
export const formatNumber = (value: number) => number.format(value);
export const plural = (count: number, one: string, many = `${one}s`) => `${formatNumber(count)} ${count === 1 ? one : many}`;
