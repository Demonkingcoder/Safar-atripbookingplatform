import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useLocation } from 'react-router-dom'
import Navbar from '../component/layout/Navbar'
import Footer from '../component/layout/Footer'

function MainLayout({ children }) {
  const location = useLocation()
  const reduceMotion = useReducedMotion()
  return (
    <div className="flex min-h-screen flex-col bg-ivory">
      <Navbar />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          className="flex-1"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
          transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
      <Footer />
    </div>
  )
}

export default MainLayout
