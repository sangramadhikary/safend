interface PageHeroProps {
  title: string;
  subtitle?: string;
}

export function PageHero({ title, subtitle }: PageHeroProps) {
  return (
    <section className="bg-white px-4 sm:px-6 lg:px-8 py-16 text-center border-b border-gray-100">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-h2 sm:text-h1 font-heading font-bold text-safend-black tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-4 text-lg text-safend-slate-grey font-body">
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}
