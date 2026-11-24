import { useParams } from 'react-router-dom';
import { PrimaryErrorPage } from '../components/PrimaryErrorPage.jsx';

export default function ErrorPageRoute() {
  const { code } = useParams();
  const numericCode = Number(code);
  const resolved = Number.isFinite(numericCode) ? numericCode : 404;

  return <PrimaryErrorPage code={resolved} />;
}
