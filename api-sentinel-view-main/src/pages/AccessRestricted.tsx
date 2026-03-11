import React from 'react';
import { Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

const AccessRestricted: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="text-center space-y-4">
      <Shield className="mx-auto h-16 w-16 text-primary" />
      <h1 className="text-2xl font-bold text-foreground">Access Restricted</h1>
      <p className="text-muted-foreground max-w-md">You do not have permission to access this resource. Please contact your administrator or sales team.</p>
      <div className="flex items-center justify-center gap-3 pt-4">
        <Link to="/login" className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors">
          Sign in with different account
        </Link>
        <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          Contact Sales
        </button>
      </div>
    </div>
  </div>
);

export default AccessRestricted;
