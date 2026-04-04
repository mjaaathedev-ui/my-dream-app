import React from 'react';
import { Button } from '@/components/ui/button';

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8">
        <h1 className="text-4xl font-bold text-foreground">Welcome to My Dream App!</h1>
        <p className="text-muted-foreground text-lg">Your one-stop solution for all your needs.</p>
        <Button asChild>
          <a href="/signup">Get Started</a>
        </Button>
      </div>
    </div>
  );
};

export default Index;
