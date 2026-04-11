import { Link } from "react-router-dom";
import { XCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/i18n/LanguageContext";

const PaymentCancel = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="pt-8 pb-8 space-y-6">
          <XCircle className="h-16 w-16 text-destructive mx-auto" />
          <h1 className="text-2xl font-bold">{t('payment.cancel.title') || 'Payment Cancelled'}</h1>
          <p className="text-muted-foreground">
            {t('payment.cancel.description') || 'Your payment was not completed. No charges were made.'}
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Button asChild>
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('payment.toDashboard') || 'Go to Dashboard'}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/tasks">{t('nav.tasks') || 'Browse Tasks'}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentCancel;
