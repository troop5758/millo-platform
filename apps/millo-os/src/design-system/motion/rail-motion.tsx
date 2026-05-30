"use client"

import { motion } from "framer-motion"

export default function RailMotion({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <motion.div
      whileHover={{
        scale: 1.01,
      }}
      transition={{
        duration: 0.2,
      }}
    >
      {children}
    </motion.div>
  )
}
