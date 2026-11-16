export type Group = {
  id: string;
  name: string;
  start: string;
  end: string;
  day_start: string;
  day_end: string;
  slot_min: number;
  tz: string;
};
export type Interval = { start: Date; end: Date };
