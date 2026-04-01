import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { formatPrice } from '@/components/CurrencyToggle';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { MapPin, Clock, Search, ImageIcon, SlidersHorizontal, X } from 'lucide-react';

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  budget_fixed: number | null;
  budget_min: number | null;
  city: string | null;
  address: string | null;
  is_urgent: boolean | null;
  due_date: string | null;
  created_at: string;
  photos: string[] | null;
  status: string | null;
  category_id: string | null;
  currency: string | null;
  task_type: string | null;
  categories?: { name_en: string; name_ru: string | null; name_he: string | null } | null;
}

const urgencyColors: Record<string, string> = {
  normal: 'bg-secondary text-muted-foreground',
  urgent: 'bg-red-50 text-red-600',
};

const statusColors: Record<string, string> = {
  open: 'bg-emerald-50 text-primary',
  in_progress: 'bg-amber-50 text-amber-600',
  completed: 'bg-secondary text-muted-foreground',
};

const TaskCard = ({ task, i, locale, currency, t, getCategoryName, showStatus }: any) => (
  <motion.div
    key={task.id}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: i * 0.05 }}
  >
    <Link
      to={`/tasks/${task.id}`}
      className="block bg-card border border-border rounded-2xl p-5 hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
    >
      <div className="flex items-start gap-4">
        {task.photos && task.photos.length > 0 ? (
          <div className="w-20 h-20 rounded-xl overflow-hidden border border-border shrink-0">
            <img src={task.photos[0]} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-20 h-20 rounded-xl border border-border bg-secondary flex items-center justify-center shrink-0">
            <ImageIcon className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground truncate">{task.title}</h3>
              {task.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{task.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                {(task.city || task.address) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {task.city || task.address}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(task.created_at).toLocaleDateString()}
                </span>
                {getCategoryName(task) && (
                  <span className="bg-emerald-50 text-primary text-xs font-medium px-2 py-0.5 rounded-full">
                    {getCategoryName(task)}
                  </span>
                )}
                {showStatus && task.status && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[task.status] || 'bg-secondary text-muted-foreground'}`}>
                    {t(`tasks.status.${task.status}`)}
                  </span>
                )}
              </div>
            </div>
            <div className="text-end shrink-0">
              <div className="text-lg font-bold text-primary">
                {formatPrice(task.budget_fixed || task.budget_min || 0, currency, task.currency)}
              </div>
              <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                task.is_urgent ? urgencyColors.urgent : urgencyColors.normal
              }`}>
                {task.is_urgent ? t('task.urgency.urgent') : t('task.urgency.flexible')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  </motion.div>
);

const TasksPage = () => {
  const { t, currency, locale } = useLanguage();
  const { user, roles, profile } = useAuth();
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterBudgetMin, setFilterBudgetMin] = useState('');
  const [filterBudgetMax, setFilterBudgetMax] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [myTasks, setMyTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<{ id: string; name_en: string; name_ru: string | null; name_he: string | null }[]>([]);
  const [tab, setTab] = useState<'all' | 'my'>('all');

  const isTasker = roles.includes('tasker');

  // Auto-set city filter from user profile on initial load
  useEffect(() => {
    if (profile?.city) {
      setFilterCity(profile.city);
    }
  }, [profile?.city]);

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: tasksData }, { data: catsData }] = await Promise.all([
        supabase
          .from('tasks')
          .select('*, categories(name_en, name_ru, name_he)')
          .eq('status', 'open')
          .order('created_at', { ascending: false }),
        supabase.from('categories').select('id, name_en, name_ru, name_he').order('sort_order'),
      ]);
      setTasks((tasksData as TaskRow[]) || []);
      setCategories(catsData || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!user || !isTasker) return;
    const fetchMyTasks = async () => {
      const { data } = await supabase
        .from('tasks')
        .select('*, categories(name_en, name_ru, name_he)')
        .eq('assigned_to', user.id)
        .in('status', ['in_progress', 'open', 'completed'])
        .order('created_at', { ascending: false });
      setMyTasks((data as TaskRow[]) || []);
    };
    fetchMyTasks();
  }, [user, isTasker]);

  const getCategoryName = (task: TaskRow) => {
    const cat = task.categories;
    if (!cat) return '';
    if (locale === 'ru') return cat.name_ru || cat.name_en;
    if (locale === 'he') return cat.name_he || cat.name_en;
    return cat.name_en;
  };

  // Extract unique cities from tasks
  const cities = [...new Set(tasks.map(t => t.city).filter(Boolean))] as string[];

  const filtered = tasks.filter((task) => {
    if (filterCat && task.category_id !== filterCat) return false;
    if (search && !task.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCity && task.city !== filterCity) return false;
    const budget = task.budget_fixed || task.budget_min || 0;
    if (filterBudgetMin && budget < Number(filterBudgetMin)) return false;
    if (filterBudgetMax && budget > Number(filterBudgetMax)) return false;
    return true;
  });

  const activeFilters = [filterCat, filterCity, filterBudgetMin, filterBudgetMax].filter(Boolean).length;

  const clearFilters = () => {
    setFilterCat('');
    setFilterCity('');
    setFilterBudgetMin('');
    setFilterBudgetMax('');
    setSearch('');
  };

  const displayTasks = tab === 'my' ? myTasks : filtered;

  return (
    <div className="py-8">
      <div className="container">
        <h1 className="text-2xl font-bold mb-6">{t('tasks.title')}</h1>

        {/* Tabs for taskers */}
        {isTasker && (
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setTab('all')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('tasks.allTasks')}
            </button>
            <button
              onClick={() => setTab('my')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === 'my' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('nav.myTasks')} ({myTasks.length})
            </button>
          </div>
        )}

        {tab === 'all' && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder={t('general.search')}
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  showFilters || activeFilters > 0
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-input bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                {t('tasks.filter')}
                {activeFilters > 0 && (
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                    {activeFilters}
                  </span>
                )}
              </button>
            </div>

            {/* Expanded filters */}
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 p-4 rounded-2xl border border-border bg-card space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-muted-foreground">{t('task.category')}</label>
                    <select
                      value={filterCat}
                      onChange={(e) => setFilterCat(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="">{t('tasks.allTasks')}</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {locale === 'ru' ? c.name_ru || c.name_en : locale === 'he' ? c.name_he || c.name_en : c.name_en}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-muted-foreground">{t('profile.city')}</label>
                    <select
                      value={filterCity}
                      onChange={(e) => setFilterCity(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="">{t('tasks.allTasks')}</option>
                      {cities.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-muted-foreground">{t('tasks.filter.budgetFrom')}</label>
                    <input
                      type="number"
                      value={filterBudgetMin}
                      onChange={(e) => setFilterBudgetMin(e.target.value)}
                      placeholder={currency === 'ILS' ? '₪' : '$'}
                      className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-muted-foreground">{t('tasks.filter.budgetTo')}</label>
                    <input
                      type="number"
                      value={filterBudgetMax}
                      onChange={(e) => setFilterBudgetMax(e.target.value)}
                      placeholder={currency === 'ILS' ? '₪' : '$'}
                      className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>
                {activeFilters > 0 && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 text-xs text-destructive hover:underline"
                  >
                    <X className="w-3 h-3" />
                    {t('tasks.filter.clear')}
                  </button>
                )}
              </motion.div>
            )}
          </>
        )}

        <div className="grid gap-4">
          {loading && <p className="text-center text-muted-foreground py-12">Loading...</p>}
          {!loading && displayTasks.length === 0 && (
            <p className="text-center text-muted-foreground py-12">
              {tab === 'my' ? t('tasks.noMyTasks') : t('tasks.noResults')}
            </p>
          )}
          {displayTasks.map((task, i) => (
            <TaskCard
              key={task.id}
              task={task}
              i={i}
              locale={locale}
              currency={currency}
              t={t}
              getCategoryName={getCategoryName}
              showStatus={tab === 'my'}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default TasksPage;
