import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatPrice } from '@/components/CurrencyToggle';
import { motion } from 'framer-motion';
import { MapPin, Clock, MessageCircle, Filter, Search } from 'lucide-react';

const mockTasks = [
  { id: '1', titleKey: 'mock.task.1', category: 'cleaning', budget: 120, location: 'Tel Aviv', urgency: 'soon', offers: 5, date: '2026-03-27' },
  { id: '2', titleKey: 'mock.task.2', category: 'moving', budget: 300, location: 'Jerusalem', urgency: 'flexible', offers: 3, date: '2026-04-01' },
  { id: '3', titleKey: 'mock.task.3', category: 'repair', budget: 80, location: 'Haifa', urgency: 'urgent', offers: 7, date: '2026-03-25' },
  { id: '4', titleKey: 'mock.task.4', category: 'digital', budget: 500, location: 'Remote', urgency: 'flexible', offers: 12, date: '2026-04-05' },
  { id: '5', titleKey: 'mock.task.5', category: 'consulting', budget: 150, location: 'Online', urgency: 'soon', offers: 2, date: '2026-03-28' },
  { id: '6', titleKey: 'mock.task.6', category: 'delivery', budget: 200, location: 'Moscow', urgency: 'urgent', offers: 4, date: '2026-03-26' },
];

const urgencyColors: Record<string, string> = {
  flexible: 'bg-secondary text-muted-foreground',
  soon: 'bg-amber-50 text-amber-700',
  urgent: 'bg-red-50 text-red-600',
};

const TasksPage = () => {
  const { t, currency } = useLanguage();
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');

  const filtered = mockTasks.filter((task) => {
    if (filterCat && task.category !== filterCat) return false;
    if (search && !t(task.titleKey).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="py-8">
      <div className="container">
        <h1 className="text-2xl font-bold mb-6">{t('tasks.title')}</h1>

        {/* Search & filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder={t('general.search')}
            />
          </div>
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="">{t('tasks.filter')}</option>
            {['cleaning', 'moving', 'repair', 'digital', 'consulting', 'delivery', 'beauty', 'tutoring'].map((c) => (
              <option key={c} value={c}>{t(`cat.${c}`)}</option>
            ))}
          </select>
        </div>

        {/* Task list */}
        <div className="grid gap-4">
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-12">{t('tasks.noResults')}</p>
          )}
          {filtered.map((task, i) => (
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
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{t(task.titleKey)}</h3>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {task.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {task.date}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="w-3.5 h-3.5" />
                        {task.offers} {t('tasks.offers')}
                      </span>
                    </div>
                  </div>
                  <div className="text-end shrink-0">
                    <div className="text-lg font-bold text-primary">{formatPrice(task.budget, currency)}</div>
                    <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${urgencyColors[task.urgency]}`}>
                      {t(`task.urgency.${task.urgency}`)}
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TasksPage;
