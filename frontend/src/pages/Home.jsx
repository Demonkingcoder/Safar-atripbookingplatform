import { useNavigate } from 'react-router-dom'
import Hero from '../component/home/hero'
import FeaturedTrips from '../component/home/FeaturedTrips'
import WhySafar from '../component/home/whySafar'
import HowItWorks from '../component/home/HowItWorks'
import useTrips from '../hooks/useTrips'

function Home() {
  const navigate = useNavigate()
  const { trips, loading, error, refetch } = useTrips()
  function searchTrips(destination) {
    const query = destination?.trim()
    navigate(query ? `/trips?q=${encodeURIComponent(query)}` : '/trips')
  }
  return <>
    <Hero trips={trips} onSearch={searchTrips} />
    <FeaturedTrips trips={trips.slice(0, 6)} loading={loading} error={error} onRetry={refetch} />
    <WhySafar />
    <HowItWorks />
  </>
}

export default Home
