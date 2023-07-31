# 001indinv-apalache 的结果

## 1. 令人惊叹的图表

### 1.1. 时间（对数刻度）

![time-log](001indinv-apalache-time-log.svg "时间对数刻度")

### 1.2. 时间（线性）

![time-log](001indinv-apalache-time.svg "时间线性")

### 1.3. 内存（对数刻度）

![mem-log](001indinv-apalache-mem-log.svg "内存对数刻度")

### 1.4. 内存（线性）

![mem](001indinv-apalache-mem.svg "内存线性")

### 1.5. 区域单元数量（线性）

![ncells](001indinv-apalache-ncells.svg "区域单元数量")

### 1.6. SMT子句数量（线性）

![nclauses](001indinv-apalache-nclauses.svg "SMT子句数量")

## 2. 输入参数

编号 | 文件名         | 工具       | 超时时间 | 初始状态 | 不变式           | 下一状态 | 参数
----|----------------|------------|-----------|------------|------------------|--------|------------------------------
1   |  MC_n4_f1.tla  |  apalache  |  10小时   |  TypedInv  |  TypedInv        |        |  --length=1 --cinit=ConstInit
2   |  MC_n4_f2.tla  |  apalache  |  10小时   |  TypedInv  |  TypedInv        |        |  --length=1 --cinit=ConstInit
3   |  MC_n5_f1.tla  |  apalache  |  10小时   |  TypedInv  |  TypedInv        |        |  --length=1 --cinit=ConstInit
4   |  MC_n5_f2.tla  |  apalache  |  10小时   |  TypedInv  |  TypedInv        |        |  --length=1 --cinit=ConstInit
5   |  MC_n4_f1.tla  |  apalache  |  20小时   |  Init      |  TypedInv        |        |  --length=0 --cinit=ConstInit
6   |  MC_n4_f2.tla  |  apalache  |  20小时   |  Init      |  TypedInv        |        |  --length=0 --cinit=ConstInit
7   |  MC_n5_f1.tla  |  apalache  |  20小时   |  Init      |  TypedInv        |        |  --length=0 --cinit=ConstInit
8   |  MC_n5_f2.tla  |  apalache  |  20小时   |  Init      |  TypedInv        |        |  --length=0 --cinit=ConstInit
9   |  MC_n4_f1.tla  |  apalache  |  20小时   |  TypedInv  |  Agreement       |        |  --length=0 --cinit=ConstInit
10  |  MC_n4_f2.tla  |  apalache  |  20小时   |  TypedInv  |  Accountability  |        |  --length=0 --cinit=ConstInit
11  |  MC_n5_f1.tla  |  apalache  |  20小时   |  TypedInv  |  Agreement       |        |  --length=0 --cinit=ConstInit
12  |  MC_n5_f2.tla  |  apalache  |  20小时   |  TypedInv  |  Accountability  |        |  --length=0 --cinit=ConstInit

## 3. 详细结果：001indinv-apalache-unstable.csv

01:no  |  02:工具   |  03:状态  |  04:时间（秒）  |  05:深度  |  05:内存（KB）  |  10:初始事务数  |  11:初始事务数  |  12:单元格数  |  13:子句数  |  14:平均子句长度
-------|------------|-------------|---------------|------------|-------------|------------------|------------------|-------------|---------------|--------------------
1      |  apalache  |  无错误    |  11分钟          |  1         |  3.0GB      |  0               |  0               |  217K       |  1.0M         |  89
2      |  apalache  |  无错误    |  11分钟          |  1         |  3.0GB      |  0               |  0               |  207K       |  1.0M         |  88
3      |  apalache  |  无错误    |  16分钟          |  1         |  4.0GB      |  0               |  0               |  311K       |  2.0M         |  101
4      |  apalache  |  无错误    |  14分钟          |  1         |  3.0GB      |  0               |  0               |  290K       |  1.0M         |  103
5      |  apalache  |  无错误    |  9秒           |  0         |  563MB      |  0               |  0               |  2.0K       |  14K          |  42
6      |  apalache  |  无错误    |  10秒          |  0         |  657MB      |  0               |  0               |  2.0K       |  28K          |  43
7      |  apalache  |  无错误    |  8秒           |  0         |  635MB      |  0               |  0               |  2.0K       |  17K          |  44
8      |  apalache  |  无错误    |  10秒          |  0         |  667MB      |  0               |  0               |  3.0K       |  32K          |  45
9      |  apalache  |  无错误    |  5分钟05秒        |  0         |  2.0GB      |  0               |  0               |  196K       |  889K         |  108
10     |  apalache  |  无错误    |  8分钟08秒        |  0         |  6.0GB      |  0               |  0               |  2.0M       |  3.0M         |  34
11     |  apalache  |  无错误    |  9分钟09秒        |  0         |  3.0GB      |  0               |  0               |  284K       |  1.0M         |  128
12     |  apalache  |  无错误    |  14分钟          |  0         |  7.0GB      |  0               |  0               |  4.0M       |  5.0M         |  38

I'm sorry, but as an AI text-based model, I am unable to receive or process any files or attachments. However, you can copy and paste the Markdown content here, and I will do my best to translate it for you.


# Results of 001indinv-apalache

## 1. Awesome plots

### 1.1. Time (logarithmic scale)

![time-log](001indinv-apalache-time-log.svg "Time Log")

### 1.2. Time (linear)

![time-log](001indinv-apalache-time.svg "Time Log")

### 1.3. Memory (logarithmic scale)

![mem-log](001indinv-apalache-mem-log.svg "Memory Log")

### 1.4. Memory (linear)

![mem](001indinv-apalache-mem.svg "Memory Log")

### 1.5. Number of arena cells (linear)

![ncells](001indinv-apalache-ncells.svg "Number of arena cells")

### 1.6. Number of SMT clauses (linear)

![nclauses](001indinv-apalache-nclauses.svg "Number of SMT clauses")

## 2. Input parameters

no  |  filename      |  tool      |  timeout  |  init      |  inv             |  next  |  args
----|----------------|------------|-----------|------------|------------------|--------|------------------------------
1   |  MC_n4_f1.tla  |  apalache  |  10h      |  TypedInv  |  TypedInv        |        |  --length=1 --cinit=ConstInit
2   |  MC_n4_f2.tla  |  apalache  |  10h      |  TypedInv  |  TypedInv        |        |  --length=1 --cinit=ConstInit
3   |  MC_n5_f1.tla  |  apalache  |  10h      |  TypedInv  |  TypedInv        |        |  --length=1 --cinit=ConstInit
4   |  MC_n5_f2.tla  |  apalache  |  10h      |  TypedInv  |  TypedInv        |        |  --length=1 --cinit=ConstInit
5   |  MC_n4_f1.tla  |  apalache  |  20h      |  Init      |  TypedInv        |        |  --length=0 --cinit=ConstInit
6   |  MC_n4_f2.tla  |  apalache  |  20h      |  Init      |  TypedInv        |        |  --length=0 --cinit=ConstInit
7   |  MC_n5_f1.tla  |  apalache  |  20h      |  Init      |  TypedInv        |        |  --length=0 --cinit=ConstInit
8   |  MC_n5_f2.tla  |  apalache  |  20h      |  Init      |  TypedInv        |        |  --length=0 --cinit=ConstInit
9   |  MC_n4_f1.tla  |  apalache  |  20h      |  TypedInv  |  Agreement       |        |  --length=0 --cinit=ConstInit
10  |  MC_n4_f2.tla  |  apalache  |  20h      |  TypedInv  |  Accountability  |        |  --length=0 --cinit=ConstInit
11  |  MC_n5_f1.tla  |  apalache  |  20h      |  TypedInv  |  Agreement       |        |  --length=0 --cinit=ConstInit
12  |  MC_n5_f2.tla  |  apalache  |  20h      |  TypedInv  |  Accountability  |        |  --length=0 --cinit=ConstInit

## 3. Detailed results: 001indinv-apalache-unstable.csv

01:no  |  02:tool   |  03:status  |  04:time_sec  |  05:depth  |  05:mem_kb  |  10:ninit_trans  |  11:ninit_trans  |  12:ncells  |  13:nclauses  |  14:navg_clause_len
-------|------------|-------------|---------------|------------|-------------|------------------|------------------|-------------|---------------|--------------------
1      |  apalache  |  NoError    |  11m          |  1         |  3.0GB      |  0               |  0               |  217K       |  1.0M         |  89
2      |  apalache  |  NoError    |  11m          |  1         |  3.0GB      |  0               |  0               |  207K       |  1.0M         |  88
3      |  apalache  |  NoError    |  16m          |  1         |  4.0GB      |  0               |  0               |  311K       |  2.0M         |  101
4      |  apalache  |  NoError    |  14m          |  1         |  3.0GB      |  0               |  0               |  290K       |  1.0M         |  103
5      |  apalache  |  NoError    |  9s           |  0         |  563MB      |  0               |  0               |  2.0K       |  14K          |  42
6      |  apalache  |  NoError    |  10s          |  0         |  657MB      |  0               |  0               |  2.0K       |  28K          |  43
7      |  apalache  |  NoError    |  8s           |  0         |  635MB      |  0               |  0               |  2.0K       |  17K          |  44
8      |  apalache  |  NoError    |  10s          |  0         |  667MB      |  0               |  0               |  3.0K       |  32K          |  45
9      |  apalache  |  NoError    |  5m05s        |  0         |  2.0GB      |  0               |  0               |  196K       |  889K         |  108
10     |  apalache  |  NoError    |  8m08s        |  0         |  6.0GB      |  0               |  0               |  2.0M       |  3.0M         |  34
11     |  apalache  |  NoError    |  9m09s        |  0         |  3.0GB      |  0               |  0               |  284K       |  1.0M         |  128
12     |  apalache  |  NoError    |  14m          |  0         |  7.0GB      |  0               |  0               |  4.0M       |  5.0M         |  38
