import React from 'react';
import {
  LayoutDashboard,
  ShieldCheck,
  Database,
  Landmark,
  ShoppingCart,
  Boxes,
  TrendingUp,
  Users,
  Truck,
  FileSpreadsheet,
  Sliders,
  HelpCircle,
  LucideProps
} from 'lucide-react';

interface IconHelperProps extends LucideProps {
  name: string;
}

export const IconHelper: React.FC<IconHelperProps> = ({ name, ...props }) => {
  switch (name) {
    case 'LayoutDashboard':
      return <LayoutDashboard {...props} />;
    case 'ShieldCheck':
      return <ShieldCheck {...props} />;
    case 'Database':
      return <Database {...props} />;
    case 'Landmark':
      return <Landmark {...props} />;
    case 'ShoppingCart':
      return <ShoppingCart {...props} />;
    case 'Boxes':
      return <Boxes {...props} />;
    case 'TrendingUp':
      return <TrendingUp {...props} />;
    case 'Users':
      return <Users {...props} />;
    case 'Truck':
      return <Truck {...props} />;
    case 'FileSpreadsheet':
      return <FileSpreadsheet {...props} />;
    case 'Sliders':
      return <Sliders {...props} />;
    default:
      return <HelpCircle {...props} />;
  }
};
