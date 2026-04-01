-- Pivô conjugado: dois pivôs na mesma bomba com intervalo de retorno
-- e limites operacionais baseados em velocidades reais do equipamento

ALTER TABLE pivots ADD COLUMN operation_mode text DEFAULT 'individual'
  CHECK (operation_mode IN ('individual','conjugated'));

ALTER TABLE pivots ADD COLUMN paired_pivot_id uuid REFERENCES pivots(id);

-- Intervalo real de retorno do pivô (em dias). Ex: 2 = volta a cada 2 dias
ALTER TABLE pivots ADD COLUMN return_interval_days numeric(4,1) DEFAULT 1;

-- Velocidade preferida do operador (%). Ex: 50% → 8.1mm
-- É a velocidade que o agricultor usa no dia a dia
ALTER TABLE pivots ADD COLUMN preferred_speed_percent numeric(5,1);

-- Velocidade mínima do pivô (%). Ex: 42% → 9.4mm
-- É o máximo de lâmina que o pivô consegue aplicar fisicamente
ALTER TABLE pivots ADD COLUMN min_speed_percent numeric(5,1);
