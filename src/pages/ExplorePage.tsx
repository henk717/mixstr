import { useSeoMeta } from '@unhead/react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

export function ExplorePage() {
  useSeoMeta({ title: 'Explore · Mixstr' });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="px-4 py-3 flex items-center gap-3">
          <Search size={20} className="text-primary" />
          <h1 className="text-lg font-bold">Explore</h1>
        </div>
        <div className="px-4 pb-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search Nostr..."
              className="pl-9 bg-muted border-transparent focus:border-primary"
            />
          </div>
        </div>
      </div>

      <Card className="border-dashed mx-4 my-8">
        <CardContent className="py-12 px-8 text-center">
          <Search size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Search for people, notes, and topics on Nostr. This feature is coming soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
