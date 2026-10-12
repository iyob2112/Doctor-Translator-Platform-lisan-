-- Align sessions.department_id with the schema: optional department, SET NULL on delete.
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_department_id_fkey";
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
