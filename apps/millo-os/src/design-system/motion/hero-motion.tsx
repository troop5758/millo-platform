"use client"

import { motion } from "framer-motion"

export default function HeroMotion({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <motion.div
      initial={{
        opacity: 0,
        y: 40,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      transition={{
        duration: 0.6,
      }}
    >
      {children}
    </motion.div>
  )
}
