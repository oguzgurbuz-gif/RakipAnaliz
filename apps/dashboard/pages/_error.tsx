import { NextPage } from 'next'

const ErrorPage: NextPage<{ statusCode?: number }> = ({ statusCode }) => {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>{statusCode || 'Error'}</h1>
      <p>An error occurred.</p>
    </div>
  )
}

ErrorPage.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}

export default ErrorPage
