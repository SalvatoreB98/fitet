import app from './app';
import { startCronScheduler } from './services/cronScheduler';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 FITeT Backend Server running at http://localhost:${PORT}`);
  startCronScheduler();
});

export default app;
