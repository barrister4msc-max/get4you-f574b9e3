import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { createTaskHref, type ServiceKey } from "@/lib/serviceRegistry";

interface HomeHeroProps {
  serviceLabel: string;
  services: { key: ServiceKey; label: string; icon: LucideIcon }[];
  title: ReactNode;
  description: string;
  image: string;
  children: ReactNode;
}

export function HomeHero({ serviceLabel, services, title, description, image, children }: HomeHeroProps) {
  return (
    <section className="bg-gradient-hero py-4 md:py-6" data-testid="home-banner" aria-labelledby="home-hero-title">
      <div className="container px-4 sm:px-8">
        <nav aria-labelledby="home-services-title">
          <p id="home-services-title" className="text-sm font-semibold text-foreground">{serviceLabel}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 md:flex md:flex-wrap" data-testid="home-services">
            {services.map(({ key, label, icon: Icon }) => (
              <Button key={key} asChild
                className="h-auto min-h-[52px] min-w-0 justify-start gap-2 rounded-md border border-primary/25 bg-background/90 px-3 py-3 text-start text-lg font-semibold text-foreground whitespace-normal shadow-none">
                <Link to={createTaskHref(key)}>
                  <Icon className="!size-[22px] shrink-0 text-primary" />
                  <span className="min-w-0 leading-snug">{label}</span>
                </Link>
              </Button>
            ))}
          </div>
        </nav>
        <div className="mt-4 grid items-center gap-4 lg:mt-6 lg:grid-cols-2 lg:gap-10">
          <div className="min-w-0 max-w-2xl">
            <h1 id="home-hero-title" className="text-2xl font-extrabold text-foreground md:text-3xl">{title}</h1>
            <p className="mt-3 text-base leading-normal text-foreground md:leading-relaxed">{description}</p>
            {children}
          </div>
          <img src={image} alt="" width={1366} height={768} className="block aspect-video w-full rounded-lg object-contain" />
        </div>
      </div>
    </section>
  );
}