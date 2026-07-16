import { Truck, Building2 } from "lucide-react";
import { useLocation } from "wouter";
import { Logo } from "@/components/Logo";
import { AppCard } from "@/components/AppCard";
import { motion, type Variants } from "framer-motion";
import { MobileLayout } from "@/layouts/MobileLayout";

export default function RoleSelection() {
  const [, setLocation] = useLocation();

  const container: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const item: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
  };

  return (
    <MobileLayout>
      <div className="flex-1 flex flex-col items-center justify-center p-6 w-full max-w-md mx-auto relative z-10">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} 
          animate={{ opacity: 1, scale: 1 }} 
          transition={{ duration: 0.5, type: "spring" }}
          className="mb-12 text-center"
        >
          <Logo size="lg" />
          <p className="mt-4 text-muted-foreground font-medium text-sm">نظام ذكي لإدارة وتتبع عمليات التوزيع</p>
        </motion.div>

        <motion.div 
          variants={container}
          initial="hidden"
          animate="show"
          className="w-full flex flex-col gap-4"
        >
          <motion.div variants={item} className="w-full">
            <AppCard 
              interactive 
              onClick={() => setLocation("/driver-auth")}
              className="flex flex-col items-center justify-center min-h-[140px] gap-3 relative overflow-hidden group"
              data-testid="card-driver"
            >
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2 group-hover:scale-110 transition-transform duration-300">
                <Truck size={32} strokeWidth={2} />
              </div>
              <h2 className="text-xl font-bold text-foreground">سائق</h2>
            </AppCard>
          </motion.div>

          <motion.div variants={item} className="w-full">
            <AppCard 
              interactive 
              onClick={() => setLocation("/company-auth")}
              className="flex flex-col items-center justify-center min-h-[140px] gap-3 relative overflow-hidden group"
              data-testid="card-company"
            >
              <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center text-secondary mb-2 group-hover:scale-110 transition-transform duration-300">
                <Building2 size={32} strokeWidth={2} />
              </div>
              <h2 className="text-xl font-bold text-foreground">صاحب الشركة</h2>
            </AppCard>
          </motion.div>
        </motion.div>
      </div>
    </MobileLayout>
  );
}
