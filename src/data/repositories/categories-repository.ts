import { getDb } from '@/data/local/db';

export type Category = {
  id: string;
  userId: string | null;
  name: string;
  parentCategoryId: string | null;
  icon: string | null;
};

type CategoryRow = {
  id: string;
  user_id: string | null;
  name: string;
  parent_category_id: string | null;
  icon: string | null;
};

export async function listCategories(userId: string): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CategoryRow>(
    `select * from categories where user_id is null or user_id = ? order by name asc`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    parentCategoryId: row.parent_category_id,
    icon: row.icon,
  }));
}
