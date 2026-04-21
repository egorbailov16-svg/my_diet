type PageScreenProps = {
  title: string;
  description: string;
};

export function PageScreen({ title, description }: PageScreenProps) {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-neutral-600">{description}</p>
      <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
        Content will be added in next steps.
      </div>
    </section>
  );
}
