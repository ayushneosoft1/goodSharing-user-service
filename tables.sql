/*

CREATE TABLE public.users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT now
()
);

*/

/* STEPS TO SOLVE THIS  */
/* STEP : 1 Add New Columns */

ALTER TABLE public.users
ADD COLUMN first_name TEXT,
ADD COLUMN last_name TEXT;

/* STEP: 2 -- If old 'name' data exists and you want to preserve it */

UPDATE public.users
SET
  first_name = split_part(name, ' ', 1),
  last_name  = COALESCE(NULLIF(split_part(name, ' ', 2), ''), '');

/*  -- -- Step 3: Make new columns NOT NULL (after data is populated) */

ALTER TABLE public.users
ALTER COLUMN first_name
SET
NOT NULL,
ALTER COLUMN last_name
SET
NOT NULL;

-- Step 4: Drop old column
ALTER TABLE public.users
DROP COLUMN name;


/* 

SELECT * FROM public.users
ORDER BY id ASC;

ALTER TABLE public.users
DROP COLUMN name;

SELECT id, first_name, last_name FROM public.users;

SELECT  id FROM public.users;
SELECT  first_name FROM public.users;
SELECT  last_name FROM public.users;

ALTER TABLE public.users
ADD COLUMN first_name TEXT,
ADD COLUMN last_name TEXT;

*/


