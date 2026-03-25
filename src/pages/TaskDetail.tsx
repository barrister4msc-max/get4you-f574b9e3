import { useParams, Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatPrice } from '@/components/CurrencyToggle';
import { MapPin, Clock, User, Star, MessageCircle, Shield, ArrowRight } from 'lucide-react';

const mockTask = {
  id: '1',
  title: 'Deep clean apartment (3 rooms)',
  description: 'Need a thorough deep cleaning of a 3-room apartment including kitchen, bathroom, living room and 2 bedrooms. Must bring own supplies. Approximately 80 sqm.',
  category: 'cleaning',
  budget: 120,
  location: 'Tel Aviv, Dizengoff St',
  urgency: 'soon',
  date: '2026-03-27',
  taskType: 'onsite',
  client: { name: 'Alex M.', rating: 4.8, tasks: 12 },
  offers: [
    { id: '1', name: 'Maria K.', rating: 4.9, price: 110, completed: 45, comment: 'Available on that date, I bring my own supplies.' },
    { id: '2', name: 'Pavel S.', rating: 4.7, price: 130, completed: 23, comment: 'Professional cleaning with eco-friendly products.' },
    { id: '3', name: 'Yael B.', rating: 5.0, price: 100, completed: 67, comment: 'Experienced cleaner, can start early morning.' },
  ],
};

const TaskDetailPage = () => {
  const { t, currency } = useLanguage();

  return (
    <div className="py-8">
      <div className="container max-w-4xl">
        <div className="grid md:grid-cols-3 gap-6">
          {/* Main */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="bg-emerald-50 text-primary text-xs font-semibold px-2.5 py-1 rounded-full">
                  {t(`cat.${mockTask.category}`)}
                </span>
                <span className="bg-amber-50 text-amber-700 text-xs font-medium px-2.5 py-1 rounded-full">
                  {t(`task.urgency.${mockTask.urgency}`)}
                </span>
                <span className="bg-secondary text-muted-foreground text-xs px-2.5 py-1 rounded-full">
                  {t(`task.type.${mockTask.taskType}`)}
                </span>
              </div>
              <h1 className="text-xl font-bold">{mockTask.title}</h1>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{mockTask.description}</p>

              <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{mockTask.location}</span>
                <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{mockTask.date}</span>
              </div>

              {/* Photo placeholder */}
              <div className="mt-4 bg-secondary rounded-xl h-40 flex items-center justify-center text-sm text-muted-foreground">
                📷 Task photos
              </div>
            </div>

            {/* Offers */}
            <div>
              <h2 className="font-bold text-lg mb-4">{mockTask.offers.length} {t('tasks.offers')}</h2>
              <div className="space-y-3">
                {mockTask.offers.map((offer) => (
                  <div key={offer.id} className="bg-card border border-border rounded-xl p-4 hover:shadow-card-hover transition-shadow">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                          <User className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-semibold text-sm">{offer.name}</div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{offer.rating}</span>
                            <span>{offer.completed} tasks</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="font-bold text-primary">{formatPrice(offer.price, currency)}</div>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">{offer.comment}</p>
                    <button className="mt-3 text-xs font-semibold text-primary hover:underline">
                      Choose this tasker →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl p-5 sticky top-20">
              <div className="text-2xl font-bold text-primary">{formatPrice(mockTask.budget, currency)}</div>
              <p className="text-xs text-muted-foreground mt-1">{t('task.budget')}</p>

              <button className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity">
                {t('tasks.respond')}
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="mt-5 pt-5 border-t border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{mockTask.client.name}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      {mockTask.client.rating} · {mockTask.client.tasks} tasks
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 text-xs text-primary font-medium">
                <Shield className="w-4 h-4" />
                Escrow protected
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailPage;
