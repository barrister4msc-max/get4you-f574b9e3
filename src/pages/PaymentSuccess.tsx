import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/i18n/LanguageContext";

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("order_id");
  const { t } = useLanguage();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    const fetchOrder = async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, status, amount, currency, task_id, created_at")
        .eq("allpay_order_id", orderId)
        .maybeSingle();
      setOrder(data);
      setLoading(false);
    };
    fetchOrder();
    // Poll for status update (webhook may be delayed)
    const interval = setInterval(fetchOrder, 3000);
    const timeout = setTimeout(() => clearInterval(interval), 30000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [orderId]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="pt-8 pb-8 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">{t('payment.checking') || 'Checking payment status...'}</p>
            </div>
          ) : (
            <>
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
              <h1 className="text-2xl font-bold">{t('payment.success.title') || 'Payment Successful!'}</h1>
              <p className="text-muted-foreground">
                {t('payment.success.description') || 'Your payment has been processed. The tasker has been notified.'}
              </p>
              {order && (
                <div className="bg-muted rounded-lg p-4 text-sm space-y-1">
                  <p><span className="font-medium">{t('payment.amount') || 'Amount'}:</span> {order.amount} {order.currency}</p>
                  <p><span className="font-medium">{t('payment.status') || 'Status'}:</span> {order.status === 'paid' ? '✅ Paid' : order.status === 'pending' ? '⏳ Processing' : order.status}</p>
                </div>
              )}
              <div className="flex flex-col gap-2 pt-2">
                <Button asChild>
                  <Link to="/tasks">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t('payment.backToTasks') || 'Вернуться к задачам'}
                  </Link>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentSuccess;
