import { useEffect, useState } from "react";
import styles from "../styles/SangueChuva.module.css"; 

export default function SangueChuva() {
  const [gotas, setGotas] = useState([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setGotas((old) => {
        const novaGota = {
          id: Date.now(),
          left: Math.random() * 100 + "%",
          duration: 3 + Math.random() * 3,
        };
        const novasGotas = [...old, novaGota].slice(-30);
        return novasGotas;
      });
    }, 300);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.sangueChuva}>
      {gotas.map((gota) => (
        <div
          key={gota.id}
          className={styles.gota}
          style={{
            left: gota.left,
            animationDuration: `${gota.duration}s`,
          }}
        ></div>
      ))}
    </div>
  );
}
