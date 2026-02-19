import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AnimatedPageProps {
    children: React.ReactNode;
}

const pageVariants = {
    initial: {
        opacity: 0,
        y: 20,
        filter: 'blur(10px)',
    },
    in: {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
    },
    out: {
        opacity: 0,
        y: -20,
        filter: 'blur(10px)',
    }
};

const pageTransition = {
    type: "tween",
    ease: "circOut",
    duration: 0.5
};

export const AnimatedPage: React.FC<AnimatedPageProps> = ({ children }) => {
    return (
        <motion.div
            initial="initial"
            animate="in"
            exit="out"
            variants={pageVariants}
            transition={pageTransition}
            className="w-full h-full"
        >
            {children}
        </motion.div>
    );
};
