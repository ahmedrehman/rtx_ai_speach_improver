create table if not exists eval_costs (
  kind text primary key,
  evals integer not null default 0,
  estimated_cost real not null default 0,
  updated_at text not null default (datetime('now'))
);
