import { useEffect, useState } from 'react';

import { Category, listCategories } from '@/data/repositories/categories-repository';

export function useCategories(userId: string | null) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    async function load() {
      setCategories(await listCategories(userId as string));
      setLoading(false);
    }
    load();
  }, [userId]);

  return { categories, loading };
}
