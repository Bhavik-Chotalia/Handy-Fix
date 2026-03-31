import { motion } from "framer-motion";
import { Users, Star, Award, IndianRupee } from "lucide-react";

const stats = [
  { icon: Users,        value: "50,000+", label: "Happy Customers",  delay: 0   },
  { icon: IndianRupee,  value: "₹93+",    label: "Avg. Savings",     delay: 0.1 },
  { icon: Star,         value: "4.9★",    label: "Avg. Rating",      delay: 0.2 },
  { icon: Award,        value: "2,000+",  label: "Verified Pros",    delay: 0.3 },
];

const StatsBar = () => {
  return (
    <section className="py-12 bg-gradient-gold">
      <div className="container mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
        {stats.map((stat) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.5, delay: stat.delay }}
            className="flex flex-col items-center text-center">
            <stat.icon className="w-6 h-6 text-primary-foreground/70 mb-2" />
            <p className="text-3xl md:text-4xl font-extrabold text-primary-foreground">{stat.value}</p>
            <p className="text-sm text-primary-foreground/70 font-medium">{stat.label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default StatsBar;
