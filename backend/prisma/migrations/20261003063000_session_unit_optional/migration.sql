-- Unit is chosen on the open session, not when the consult is created.
ALTER TABLE "sessions" ALTER COLUMN "department_id" DROP NOT NULL;
