import { motion, AnimatePresence } from 'framer-motion';
import type { ReactNode } from 'react';

const pageVariants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
};

export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <motion.div
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className={className}
        >
            {children}
        </motion.div>
    );
}
