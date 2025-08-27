import Head from "next/head";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import styles from "../styles/Home.module.css";

import SangueChuva from "../components/SangueChuva";
import Morcego from "../components/Morcego";
import Ads from "../components/Ads";

import { v4 as uuidv4 } from "uuid";

export default function Home() {
  const router = useRouter();

  const [phrase, setPhrase] = useState("Bem-vindo ao Stigween...");
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle");
  const [touchTimeout, setTouchTimeout] = useState(null);
  const [ticketCount, setTicketCount] = useState(1);
  const [ticketNames, setTicketNames] = useState([""]);
  const [paymentId, setPaymentId] = useState(null);

  const clientId = useRef(uuidv4());

  const leftEyeRef = useRef(null);
  const rightEyeRef = useRef(null);
  const meowAudio = useRef(null);

  
  const firstLotPrice = 70; 
  const couplePrice = 130;  

  const calculatePrice = (quantity) => {
    if (quantity === 1) return firstLotPrice;
    if (quantity % 2 === 0) return (quantity / 2) * couplePrice;
    return Math.floor(quantity / 2) * couplePrice + firstLotPrice;
  };

  useEffect(() => {
    meowAudio.current = new Audio("/cat-meow.mp3");
  }, []);

  useEffect(() => {
    setTicketNames((old) => {
      const next = [...old];
      while (next.length < ticketCount) next.push("");
      while (next.length > ticketCount) next.pop();
      return next;
    });
  }, [ticketCount]);

  const ticketTextAnimationClass = state === "hover" ? styles.glowPulse : "";

  useEffect(() => {
    const phrases = [
      "O medo espreita na escuridão...",
      "O gatinho observa seus passos...",
      "Prepare-se para o inesperado...",
      "A noite traz mistérios ocultos...",
      "Sinta o arrepio da Stigween...",
    ];
    const interval = setInterval(() => {
      setPhrase(phrases[Math.floor(Math.random() * phrases.length)]);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    const { status, payment_id } = router.query;
    if (payment_id) {
      setPaymentId(payment_id);
    }
    if (["success", "failure", "pending"].includes(status)) {
      setPaymentStatus(status);
      const nextQuery = { ...router.query };
      delete nextQuery.status;
      router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
    }
  }, [router.isReady, router.query]);

  useEffect(() => {
    return () => {
      if (touchTimeout) clearTimeout(touchTimeout);
    };
  }, [touchTimeout]);

  useEffect(() => {
    function handleMouseMove(e) {
      if (!leftEyeRef.current || !rightEyeRef.current) return;

      const updateEye = (eye, eX, eY) => {
        const rect = eye.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = eX - cx;
        const dy = eY - cy;
        const dist = Math.min(5, Math.hypot(dx, dy));
        const angle = Math.atan2(dy, dx);
        eye.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`;
      };

      updateEye(leftEyeRef.current, e.clientX, e.clientY);
      updateEye(rightEyeRef.current, e.clientX, e.clientY);
    }

    function resetEyes() {
      if (leftEyeRef.current) leftEyeRef.current.style.transform = "translate(0,0)";
      if (rightEyeRef.current) rightEyeRef.current.style.transform = "translate(0,0)";
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", resetEyes);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", resetEyes);
    };
  }, []);

  const closeNotification = () => setPaymentStatus(null);

  const handlePayment = async (e) => {
    e.preventDefault();

    if (!email.trim()) return alert("Por favor, preencha um e-mail válido.");
    if (ticketNames.some((n) => !n.trim())) return alert("Preencha todos os nomes.");

    try {
      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Ingresso Stigween",
          quantity: ticketCount,
          price: calculatePrice(ticketCount), 
          email,
          names: ticketNames,
          clientId: clientId.current,
        }),
      });
      if (!res.ok) throw new Error("Erro ao criar preferência");
      const data = await res.json();
      if (data.init_point) {
        window.location.href = data.init_point;
      } else alert("Não foi possível obter o link.");
    } catch (err) {
      alert("Erro: " + err.message);
    }
  };

  const handleTouchStart = () => {
    if (state === "idle") {
      setState("hover");
      const t = setTimeout(() => {
        if (state !== "form") setState("form");
      }, 800);
      setTouchTimeout(t);
    }
  };

  const handleTouchEnd = () => {
    if (touchTimeout) {
      clearTimeout(touchTimeout);
      setTouchTimeout(null);
    }
  };

  const handleClick = () => {
    if (state !== "form") setState("form");
    if (meowAudio.current) {
      meowAudio.current.currentTime = 0;
      meowAudio.current.play();
    }
  };

  const handleNameChange = (i, v) => {
    setTicketNames((old) => {
      const next = [...old];
      next[i] = v;
      return next;
    });
  };

  const getPhraseAnimationClass = (txt) => {
    if (txt.includes("medo")) return styles.hauntedShadow;
    if (txt.includes("gatinho")) return styles.flicker;
    if (txt.includes("Prepare-se")) return styles.glowPulse;
    if (txt.includes("Noite")) return styles.ghostShadow;
    if (txt.includes("arrepio")) return styles.scaryShake;
    return "";
  };

  useEffect(() => {
    if (!paymentId || !clientId.current) return;

    async function checkStatus() {
      try {
        const res = await fetch(`/api/payment-status?clientId=${clientId.current}`);
        if (!res.ok) throw new Error("Erro ao buscar status");
        const data = await res.json();
        if (data.status && data.status !== paymentStatus) {
          setPaymentStatus(data.status);
        }
      } catch {
      }
    }

    if (paymentStatus === "pending") {
      const interval = setInterval(checkStatus, 10000);
      return () => clearInterval(interval);
    }
  }, [paymentId, paymentStatus]);

  return (
    <div className={styles.pageWrapper}>
      <Head>
        <title>Stigween</title>
        <link href="https://fonts.googleapis.com/css2?family=Creepster&display=swap" rel="stylesheet" />
      </Head>

      <SangueChuva />
      <Morcego />

      {paymentStatus && (
        <div className={styles.modalOverlay} onClick={closeNotification}>
          <div
            className={`${styles.modalContent} ${styles[paymentStatus]}`}
            onClick={(e) => e.stopPropagation()}
          >
            {paymentStatus === "success" && (
              <>
                <h2>🎃 O pacto está selado!</h2>
                <p>As sombras aceitaram sua oferenda… seu ingresso foi conjurado com sucesso. Prepare-se para a noite em que os portões se abrem. 🕸️</p>
              </>
            )}
            {paymentStatus === "failure" && (
              <>
                <h2>👻 Algo deu errado…</h2>
                <p>Os espíritos recusaram seu tributo. Talvez seja hora de tentar novamente antes que a escuridão te encontre… 🦇</p>
              </>
            )}
            {paymentStatus === "pending" && (
              <>
                <h2>🕯️ O ritual ainda não terminou…</h2>
                <p>Seu pagamento está nas mãos dos oráculos. Aguarde um sinal em seu e-mail quando as forças decidirem. 🔮</p>
              </>
            )}
            <button className={styles.closeModalBtn} onClick={closeNotification}>Fechar este portal ✨</button>
          </div>
        </div>
      )}

      <header className={styles.header}>
        <img src="/stigween-banner.jpg" alt="Stigween Banner" className={styles.banner} />
      </header>

      <main className={styles.main}>
        <div className={styles.mainContent}>
          <div className={styles.mainLeft}>
            <div className={styles.eventoBox}>
              <h2>🕸️ Grande Evento Stigween</h2>
              <p className={`${styles.dynamicPhrase} ${getPhraseAnimationClass(phrase)}`}>{phrase}</p>
              <p className={styles.flicker}>Data do evento: <strong>01/11</strong></p>

              <div className={styles.catContainer}>
                <span ref={leftEyeRef} className={`${styles.catEye} ${styles.leftEye}`}></span>
                <span ref={rightEyeRef} className={`${styles.catEye} ${styles.rightEye}`}></span>

                <img src="/cat-mouth-closed.png" alt="Gato boca fechada" className={`${styles.catImage} ${state !== "form" ? styles.closed : ""}`} />
                <img src="/cat-mouth-open.png" alt="Gato boca aberta" className={`${styles.catImage} ${state === "form" ? styles.open : ""}`} />
              </div>

              <div
                className={`${styles.ticketBox} 
                  ${state === "hover" ? styles.ticketBoxHover : ""} 
                  ${state === "form" ? styles.ticketBoxForm : ""}`}
                onMouseEnter={() => state === "idle" && setState("hover")}
                onMouseLeave={() => state === "hover" && setState("idle")}
                onClick={handleClick}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                {state === "hover" && <div className={styles.ticketImage}></div>}

                {state === "form" ? (
                  <form className={styles.ticketForm} onClick={(e) => e.stopPropagation()} onSubmit={handlePayment}>
                    <label className={styles.ticketQuantityLabel}>
                      Quantidade de ingressos:
                      <div className={styles.ticketQuantitySelector}>
                        <button type="button" onClick={() => setTicketCount((c) => Math.max(1, c - 1))} className={styles.qtyBtn}>–</button>
                        <span className={styles.qtyNumber}>{ticketCount}</span>
                        <button type="button" onClick={() => setTicketCount((c) => Math.min(5, c + 1))} className={styles.qtyBtn}>+</button>
                      </div>
                    </label>

                    {ticketNames.map((name, i) => (
                      <input
                        key={i}
                        type="text"
                        placeholder={`Nome completo #${i + 1}`}
                        value={name}
                        onChange={(e) => handleNameChange(i, e.target.value)}
                        className={styles.ticketNameInput}
                        required
                      />
                    ))}

                    <input
                      type="email"
                      placeholder="E-mail (obrigatório)"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className={styles.ticketEmailInput}
                    />

                   <p className={styles.hauntedShadow}>
                      💰 Valor unitário: R$ {firstLotPrice} <br />
                      💰 Promoção Casadinha: 2 ingressos por R$ {couplePrice} <br />
                      <strong>💵 Total: R$ {calculatePrice(ticketCount)}</strong>
                    </p>


                    <button type="submit" className={styles.payButton}>🎃 PAGAR</button>
                    <button type="button" className={styles.closeFormButton} onClick={() => setState("idle")}>✕ Fechar</button>
                  </form>
                ) : (
                  <div className={`${styles.ticketText} ${ticketTextAnimationClass}`}>
                    <h3>🎟️ AQUI ESTÁ O INGRESSO — Para quem não teme a escuridão</h3>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <Ads />
      </main>
    </div>
  );
}