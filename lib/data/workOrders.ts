export interface WorkOrder {
  id: number
  address: string
  tenant: string
  category: 'HVAC' | 'Fire' | 'Quicklook'
  lastInspection: string
  nextDue: string
  flag?: string | null
}

// Source: Industrial - Cyclical Maintenance Tracking.xlsx (annual HVAC & fire inspections).
// nextDue = lastInspection + 1 year (annual maintenance cycle).
export const WORK_ORDERS: WorkOrder[] = [
  {id:1,address:"10716 Hwy 191 — Unit 3",tenant:"Cortex Process Equipment, LLC",category:"HVAC",lastInspection:"2023-04-21",nextDue:"2024-04-21"},
  {id:2,address:"10716 Hwy 191 — Unit 3",tenant:"Cortex Process Equipment, LLC",category:"Fire",lastInspection:"2023-09-28",nextDue:"2024-09-28"},
  {id:3,address:"10716 Hwy 191 — Unit 5",tenant:"KLJ Solutions Holding Co.",category:"Fire",lastInspection:"2023-09-28",nextDue:"2024-09-28"},
  {id:4,address:"10716 Hwy 191 — Unit 7",tenant:"HVJ Associates, Inc.",category:"HVAC",lastInspection:"2023-04-20",nextDue:"2024-04-20"},
  {id:5,address:"10716 Hwy 191 — Unit 7",tenant:"HVJ Associates, Inc.",category:"Fire",lastInspection:"2023-09-28",nextDue:"2024-09-28"},
  {id:6,address:"10716 Hwy 191 — Unit 9",tenant:"APTIM Facilities, Inc.",category:"Fire",lastInspection:"2023-09-28",nextDue:"2024-09-28"},
  {id:7,address:"10800 Hwy 191 — Unit 1",tenant:"BlackHawk Datacom",category:"Fire",lastInspection:"2023-10-31",nextDue:"2024-10-31"},
  {id:8,address:"10800 Hwy 191 — Unit 2",tenant:"Energy Real Estate Solutions, LLC",category:"HVAC",lastInspection:"2023-03-21",nextDue:"2024-03-21"},
  {id:9,address:"10800 Hwy 191 — Unit 2",tenant:"Energy Real Estate Solutions, LLC",category:"Fire",lastInspection:"2023-10-31",nextDue:"2024-10-31"},
  {id:10,address:"10800 Hwy 191 — Unit 3",tenant:"Energy Real Estate Solutions, LLC",category:"Fire",lastInspection:"2023-10-31",nextDue:"2024-10-31"},
  {id:11,address:"10800 Hwy 191 — Unit 4",tenant:"Cactus Measurement, LLC",category:"Fire",lastInspection:"2023-10-31",nextDue:"2024-10-31"},
  {id:12,address:"10800 Hwy 191 — Unit 7",tenant:"ABRA Controls Corp.",category:"Fire",lastInspection:"2023-10-31",nextDue:"2024-10-31"},
  {id:13,address:"10800 Hwy 191 — Unit 8",tenant:"Integrated Energy Solutions, LLC",category:"Fire",lastInspection:"2023-10-31",nextDue:"2024-10-31"},
  {id:14,address:"10800 Hwy 191 — Unit 9",tenant:"Zintex, LLC",category:"HVAC",lastInspection:"2023-02-02",nextDue:"2024-02-02"},
  {id:15,address:"10800 Hwy 191 — Unit 9",tenant:"Zintex, LLC",category:"Fire",lastInspection:"2023-10-31",nextDue:"2024-10-31"},
  {id:16,address:"10800 Hwy 191 — Unit 11",tenant:"DarkVision Technologies US, Inc.",category:"HVAC",lastInspection:"2023-03-16",nextDue:"2024-03-16"},
  {id:17,address:"10800 Hwy 191 — Unit 11",tenant:"DarkVision Technologies US, Inc.",category:"Fire",lastInspection:"2023-10-31",nextDue:"2024-10-31"},
  {id:18,address:"10800 Hwy 191 — Unit 12",tenant:"Red Deer Ironworks USA Inc",category:"Fire",lastInspection:"2023-10-31",nextDue:"2024-10-31"},
  {id:19,address:"10810 Hwy 191 — Unit 2",tenant:"Proctek Texas, Inc.",category:"HVAC",lastInspection:"2023-04-20",nextDue:"2024-04-20"},
  {id:20,address:"10810 Hwy 191 — Unit 2",tenant:"Proctek Texas, Inc.",category:"Fire",lastInspection:"2023-10-31",nextDue:"2024-10-31"},
  {id:21,address:"10810 Hwy 191 — Unit 3",tenant:"Relevant Industrial, LLC",category:"Fire",lastInspection:"2023-10-31",nextDue:"2024-10-31"},
  {id:22,address:"10810 Hwy 191 — Unit 4",tenant:"Relevant Industrial, LLC",category:"Fire",lastInspection:"2023-10-31",nextDue:"2024-10-31"},
  {id:23,address:"10810 Hwy 191 — Unit 6",tenant:"National Seating & Mobility, Inc.",category:"Fire",lastInspection:"2023-10-31",nextDue:"2024-10-31"},
  {id:24,address:"1110 S. FM 1788",tenant:"Multi",category:"Fire",lastInspection:"2025-02-04",nextDue:"2026-02-04"},
  {id:25,address:"4209 S. CR 1270",tenant:"Sage Rider, Inc",category:"HVAC",lastInspection:"2022-07-01",nextDue:"2023-07-01"},
  {id:26,address:"4209 S. CR 1270",tenant:"Sage Rider, Inc",category:"Fire",lastInspection:"2022-10-01",nextDue:"2023-10-01"},
  {id:27,address:"4301 S. CR 1270",tenant:"Calvary Tool Company, LLC",category:"HVAC",lastInspection:"2023-03-22",nextDue:"2024-03-22"},
  {id:28,address:"4301 S. CR 1270",tenant:"Calvary Tool Company, LLC",category:"Fire",lastInspection:"2022-07-26",nextDue:"2023-07-26"},
  {id:29,address:"9112 W. CR 127",tenant:"TNT Crane & Rigging, LLC",category:"HVAC",lastInspection:"2023-01-27",nextDue:"2024-01-27"},
  {id:30,address:"9100 W. CR 127",tenant:"Ensign US Southern Drilling (Sublease to Master Rig Intl)",category:"HVAC",lastInspection:"2023-03-01",nextDue:"2024-03-01"},
  {id:31,address:"9100 W. CR 127",tenant:"Ensign US Southern Drilling (Sublease to Master Rig Intl)",category:"Fire",lastInspection:"2023-03-01",nextDue:"2024-03-01"},
  {id:32,address:"8801 W. CR 127",tenant:"Aggreko, LLC",category:"HVAC",lastInspection:"2023-03-24",nextDue:"2024-03-24"},
  {id:33,address:"9309 W. Interstate Hwy 20",tenant:"Turbo Drill Industries, Inc.",category:"HVAC",lastInspection:"2023-05-17",nextDue:"2024-05-17"},
  {id:34,address:"9309 W. Interstate Hwy 20",tenant:"Turbo Drill Industries, Inc.",category:"Fire",lastInspection:"2022-04-26",nextDue:"2023-04-26"},
  {id:35,address:"12210 SH 191",tenant:"Lasso Drilling, LLC",category:"HVAC",lastInspection:"2023-04-19",nextDue:"2024-04-19"},
  {id:36,address:"11910 SH 191",tenant:"Electric Drilling Technologies, LLC",category:"HVAC",lastInspection:"2022-09-30",nextDue:"2023-09-30"},
  {id:37,address:"11910 SH 191",tenant:"Electric Drilling Technologies, LLC",category:"Fire",lastInspection:"2023-01-24",nextDue:"2024-01-24"},
  {id:38,address:"7611 W. Industrial",tenant:"Bishop Lifting Products, Inc.",category:"HVAC",lastInspection:"2022-12-01",nextDue:"2023-12-01"},
  {id:39,address:"7615 Industrial Ave.",tenant:"NXL Technologies, LLC",category:"HVAC",lastInspection:"2022-12-30",nextDue:"2023-12-30"},
  {id:40,address:"3606 E. Hwy 158",tenant:"New Wave Energy Services, Ltd.",category:"HVAC",lastInspection:"2023-03-14",nextDue:"2024-03-14"},
  {id:41,address:"3606 E. Hwy 158",tenant:"New Wave Energy Services, Ltd.",category:"Fire",lastInspection:"2023-03-13",nextDue:"2024-03-13"},
  {id:42,address:"2610 E. I-20",tenant:"RTS",category:"HVAC",lastInspection:"2021-09-10",nextDue:"2022-09-10"},
  {id:43,address:"2610 E. I-20",tenant:"RTS",category:"Fire",lastInspection:"2022-06-06",nextDue:"2023-06-06"},
  {id:44,address:"2700 E. I-20",tenant:"RTS",category:"HVAC",lastInspection:"2023-04-05",nextDue:"2024-04-05"},
  {id:45,address:"2700 E. I-20",tenant:"RTS",category:"Fire",lastInspection:"2023-02-09",nextDue:"2024-02-09"},
  {id:46,address:"2704 E. I-20",tenant:"RTS",category:"HVAC",lastInspection:"2023-04-05",nextDue:"2024-04-05"},
  {id:47,address:"2704 E. I-20",tenant:"RTS",category:"Fire",lastInspection:"2023-02-09",nextDue:"2024-02-09"},
  {id:48,address:"2616 E. I-20",tenant:"RTS",category:"HVAC",lastInspection:"2023-04-05",nextDue:"2024-04-05"},
  {id:49,address:"2616 E. I-20",tenant:"RTS",category:"Fire",lastInspection:"2023-02-09",nextDue:"2024-02-09"},
  {id:50,address:"2712 E. I-20",tenant:"RTS",category:"HVAC",lastInspection:"2023-03-23",nextDue:"2024-03-23"},
  {id:51,address:"2712 E. I-20",tenant:"RTS",category:"Fire",lastInspection:"2023-02-09",nextDue:"2024-02-09"},
  {id:52,address:"2720 E. I-20",tenant:"AG Diesel",category:"HVAC",lastInspection:"2023-03-07",nextDue:"2024-03-07"},
  {id:53,address:"2720 E. I-20",tenant:"AG Diesel",category:"Fire",lastInspection:"2023-03-08",nextDue:"2024-03-08"},
  {id:54,address:"2825 E. I-20",tenant:"MRC Global (US) Inc",category:"HVAC",lastInspection:"2023-03-08",nextDue:"2024-03-08"},
  {id:55,address:"7715 W. Industrial Ave.",tenant:"Dynamic Oil Services",category:"HVAC",lastInspection:"2023-03-20",nextDue:"2024-03-20"},
  {id:56,address:"7715 W. Industrial Ave.",tenant:"Dynamic Oil Services",category:"Fire",lastInspection:"2023-03-30",nextDue:"2024-03-30"},
  {id:57,address:"7907 W. Industrial Ave.",tenant:"Gage Western, LLC",category:"HVAC",lastInspection:"2022-12-02",nextDue:"2023-12-02"},
  {id:58,address:"7907 W. Industrial Ave.",tenant:"Gage Western, LLC",category:"Fire",lastInspection:"2022-04-01",nextDue:"2023-04-01"},
  {id:59,address:"8001 W. Industrial Ave",tenant:"TriPower Energy Services, LLC",category:"HVAC",lastInspection:"2023-04-19",nextDue:"2024-04-19"},
  {id:60,address:"11809 W. CR 125 (Odessa)",tenant:"ChampionX LLC",category:"HVAC",lastInspection:"2023-04-07",nextDue:"2024-04-07"},
]
