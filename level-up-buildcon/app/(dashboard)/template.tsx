'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import NProgress from 'nprogress'

export default function Template({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Finish loading bar when component mounts
    NProgress.done()
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
