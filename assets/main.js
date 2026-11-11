(() => {
  "use strict";

  /* ==========================================================================
     PORTFOLIO CONFIGURATION — SINGLE PLACE TO UPDATE CREDENTIALS & LINKS
     --------------------------------------------------------------------------
     1. `email` / `emailLive`: Set your real email and switch `emailLive: true`.
     2. `social`: Paste full https:// URLs for github, linkedin, twitter.
     3. `turnstileSiteKey`: Paste your Cloudflare Turnstile Site Key (public).
        Keep TURNSTILE_SECRET_KEY ONLY in server env vars (never in this file!).
     4. `gaMeasurementId`: Paste your Google Analytics 4 ID (e.g. "G-ABC123XYZ").
     5. `contactEndpoint`: Serverless POST handler (defaults to "/api/contact").
     ========================================================================== */
  const PORTFOLIO_CONFIG = {
    siteUrl: "https://aadvikgemini.dev",
    email: "hello@aadvikgemini.dev",
    emailLive: false,
    social: {
      github: "https://github.com/aadvikgemini",
      linkedin: "https://in.linkedin.com/in/aadvik-gemini-1b011142b"
    },
    contactEndpoint: "/api/contact",
    turnstileSiteKey: "",
    gaMeasurementId: ""
  };

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const htmlEl = document.documentElement;

  /* --------------------------------------------------------------------------
     1. CONSENT-GATED GOOGLE ANALYTICS 4 (NO DUPLICATE SCRIPTS)
     -------------------------------------------------------------------------- */
  const CONSENT_KEY = "ag_analytics_consent";
  let gaLoaded = false;

  function isValidGaId(id) {
    return typeof id === "string" && /^G-[A-Z0-9]{6,}$/i.test(id.trim()) && !id.includes("XXXX");
  }

  function getConsentState() {
    try {
      return window.localStorage.getItem(CONSENT_KEY);
    } catch {
      return null;
    }
  }

  function setConsentState(value) {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // Ignore storage restriction errors cleanly
    }
    updateConsentDisplays(value);
  }

  function loadGoogleAnalyticsOnce() {
    if (gaLoaded || !isValidGaId(PORTFOLIO_CONFIG.gaMeasurementId)) return;
    if (document.getElementById("ga4-script")) {
      gaLoaded = true;
      return;
    }

    const id = PORTFOLIO_CONFIG.gaMeasurementId.trim();
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };

    window.gtag("js", new Date());
    window.gtag("config", id, { anonymize_ip: true });

    const script = document.createElement("script");
    script.id = "ga4-script";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);
    gaLoaded = true;
  }

  function trackEvent(eventName, params = {}) {
    if (getConsentState() === "granted" && typeof window.gtag === "function") {
      window.gtag("event", eventName, params);
    }
  }

  const consentBanner = document.getElementById("consent-banner");
  const consentAcceptBtn = document.getElementById("consent-accept");
  const consentDeclineBtn = document.getElementById("consent-decline");

  function updateConsentDisplays(state) {
    const label =
      state === "granted"
        ? "Granted (Analytics enabled when GA4 Measurement ID is configured)"
        : state === "denied"
          ? "Declined (Analytics disabled)"
          : "Not yet selected";

    document.querySelectorAll("[data-consent-status]").forEach((el) => {
      el.textContent = label;
    });
  }

  function initAnalyticsConsent() {
    const saved = getConsentState();
    updateConsentDisplays(saved);

    if (saved === "granted") {
      loadGoogleAnalyticsOnce();
    } else if (!saved && consentBanner) {
      consentBanner.classList.add("is-visible");
    }

    if (consentAcceptBtn && consentBanner) {
      consentAcceptBtn.addEventListener("click", () => {
        setConsentState("granted");
        consentBanner.classList.remove("is-visible");
        loadGoogleAnalyticsOnce();
        trackEvent("consent_granted");
      });
    }

    if (consentDeclineBtn && consentBanner) {
      consentDeclineBtn.addEventListener("click", () => {
        setConsentState("denied");
        consentBanner.classList.remove("is-visible");
      });
    }

    document.querySelectorAll("[data-consent-choice]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const choice = btn.getAttribute("data-consent-choice");
        if (choice === "granted") {
          setConsentState("granted");
          loadGoogleAnalyticsOnce();
        } else {
          setConsentState("denied");
        }
        if (consentBanner) consentBanner.classList.remove("is-visible");
      });
    });
  }

  initAnalyticsConsent();

  /* --------------------------------------------------------------------------
     2. CHARACTER & WORD SPLITTING FOR MOTION REVEALS
     -------------------------------------------------------------------------- */
  function splitHeroChars() {
    const lines = document.querySelectorAll("[data-split-chars]");
    let globalIndex = 0;

    lines.forEach((line) => {
      const text = line.textContent.trim();
      line.textContent = "";
      for (const char of text) {
        const span = document.createElement("span");
        span.className = "hero__char";
        span.textContent = char === " " ? "\u00A0" : char;
        span.style.transitionDelay = `${0.08 + globalIndex * 0.032}s`;
        line.appendChild(span);
        globalIndex++;
      }
    });
  }

  function splitHeadingWords() {
    const headings = document.querySelectorAll("[data-split-words]");
    headings.forEach((heading) => {
      const text = heading.textContent.trim().replace(/\s+/g, " ");
      const words = text.split(" ");
      heading.textContent = "";

      words.forEach((word, idx) => {
        const mask = document.createElement("span");
        mask.className = "word-mask";

        const inner = document.createElement("span");
        inner.className = "word-inner";
        inner.textContent = word;
        inner.style.transitionDelay = `${idx * 0.045}s`;

        mask.appendChild(inner);
        heading.appendChild(mask);

        if (idx < words.length - 1) {
          heading.appendChild(document.createTextNode(" "));
        }
      });
    });
  }

  splitHeroChars();
  splitHeadingWords();

  /* --------------------------------------------------------------------------
     3. PRELOADER & HERO ENTRANCE (HOMEPAGE)
     -------------------------------------------------------------------------- */
  const preloader = document.getElementById("preloader");
  const countEl = document.getElementById("preloader-count");
  const barEl = document.getElementById("preloader-bar");
  const heroEl = document.getElementById("hero");

  function triggerHeroEntrance() {
    if (heroEl) heroEl.classList.add("is-entered");
  }

  if (preloader && countEl && barEl) {
    if (prefersReducedMotion) {
      preloader.classList.add("is-done");
      htmlEl.classList.remove("is-loading");
      triggerHeroEntrance();
    } else {
      htmlEl.classList.add("is-loading");
      const duration = 1250;
      const start = performance.now();

      function stepPreloader(now) {
        const elapsed = now - start;
        const t = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - t, 4);
        const pct = Math.round(eased * 100);

        countEl.textContent = String(pct).padStart(2, "0");
        barEl.style.transform = `scaleX(${eased})`;

        if (t < 1) {
          requestAnimationFrame(stepPreloader);
        } else {
          setTimeout(() => {
            preloader.classList.add("is-done");
            htmlEl.classList.remove("is-loading");
            setTimeout(triggerHeroEntrance, 220);
          }, 140);
        }
      }

      requestAnimationFrame(stepPreloader);
    }
  } else {
    triggerHeroEntrance();
  }

  /* --------------------------------------------------------------------------
     4. LENIS SMOOTH SCROLLING + NAV SCROLL STATE + HERO PARALLAX
     -------------------------------------------------------------------------- */
  let lenis = null;
  const navEl = document.getElementById("site-nav");
  const heroPortrait = document.getElementById("hero-portrait");

  function handleScrollState(scrollY) {
    if (navEl) {
      navEl.classList.toggle("is-scrolled", scrollY > 40);
    }
    if (!prefersReducedMotion && heroPortrait && scrollY < window.innerHeight * 1.2) {
      heroPortrait.style.setProperty("--hero-parallax", `${(scrollY * 0.12).toFixed(2)}px`);
    }
  }

  if (!prefersReducedMotion && typeof window.Lenis === "function") {
    lenis = new window.Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.5
    });

    lenis.on("scroll", ({ scroll }) => handleScrollState(scroll));

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  } else {
    window.addEventListener("scroll", () => handleScrollState(window.scrollY), { passive: true });
  }

  /* --------------------------------------------------------------------------
     5. NAVIGATION, ANCHOR SCROLLING & MOBILE MENU
     -------------------------------------------------------------------------- */
  const burgerBtn = document.getElementById("nav-burger");
  const mobileMenu = document.getElementById("mobile-menu");
  const navLinks = document.querySelectorAll(".nav__link");

  function setMenuOpen(isOpen) {
    if (!burgerBtn || !mobileMenu) return;
    burgerBtn.setAttribute("aria-expanded", String(isOpen));
    mobileMenu.classList.toggle("is-open", isOpen);
    mobileMenu.setAttribute("aria-hidden", String(!isOpen));
    htmlEl.classList.toggle("menu-open", isOpen);

    if (lenis) {
      isOpen ? lenis.stop() : lenis.start();
    }
  }

  if (burgerBtn && mobileMenu) {
    burgerBtn.addEventListener("click", () => {
      const isOpen = burgerBtn.getAttribute("aria-expanded") === "true";
      setMenuOpen(!isOpen);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && mobileMenu.classList.contains("is-open")) {
        setMenuOpen(false);
        burgerBtn.focus();
      }
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      const targetId = anchor.getAttribute("href");
      if (!targetId || targetId === "#") return;
      const targetEl = document.querySelector(targetId);
      if (!targetEl) return;

      e.preventDefault();
      trackEvent("navigate_section", { section: targetId.slice(1) });

      if (mobileMenu && mobileMenu.classList.contains("is-open")) {
        setMenuOpen(false);
      }

      if (lenis) {
        lenis.scrollTo(targetEl, { offset: -20 });
      } else {
        targetEl.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
      }
    });
  });

  const trackedSections = ["about", "projects", "skills", "journey", "faq", "contact"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  if (trackedSections.length && "IntersectionObserver" in window) {
    const navObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            navLinks.forEach((link) => {
              link.classList.toggle("is-active", link.getAttribute("href") === `#${id}`);
            });
          }
        });
      },
      { rootMargin: "-38% 0px -52% 0px" }
    );

    trackedSections.forEach((section) => navObserver.observe(section));
  }

  /* --------------------------------------------------------------------------
     6. SCROLL-TRIGGERED SECTION & WORD REVEALS
     -------------------------------------------------------------------------- */
  const revealTargets = document.querySelectorAll(".reveal-up, [data-split-words]");

  if (revealTargets.length) {
    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      revealTargets.forEach((el) => el.classList.add("is-revealed"));
    } else {
      const revealObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-revealed");
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.14, rootMargin: "0px 0px -48px 0px" }
      );

      revealTargets.forEach((el) => revealObserver.observe(el));
    }
  }

  /* --------------------------------------------------------------------------
     7. EDITORIAL IMAGE HOVER DISTORTION (SVG DISPLACEMENT)
     -------------------------------------------------------------------------- */
  const distortMap = document.getElementById("distort-map");
  const projectCards = document.querySelectorAll(".project-card");

  if (!prefersReducedMotion && distortMap && projectCards.length) {
    let currentScale = 0;
    let targetScale = 0;
    let distortRaf = null;

    function animateDistortion() {
      currentScale += (targetScale - currentScale) * 0.14;
      distortMap.setAttribute("scale", currentScale.toFixed(2));

      if (Math.abs(targetScale - currentScale) > 0.08) {
        distortRaf = requestAnimationFrame(animateDistortion);
      } else {
        distortMap.setAttribute("scale", targetScale.toFixed(2));
        distortRaf = null;
      }
    }

    function setDistortTarget(val) {
      targetScale = val;
      if (!distortRaf) {
        distortRaf = requestAnimationFrame(animateDistortion);
      }
    }

    projectCards.forEach((card) => {
      card.addEventListener("mouseenter", () => {
        setDistortTarget(18);
        setTimeout(() => {
          if (card.matches(":hover")) setDistortTarget(4);
        }, 190);
      });

      card.addEventListener("mouseleave", () => {
        setDistortTarget(0);
      });
    });
  }

  /* --------------------------------------------------------------------------
     8. INTERACTIVE JOURNEY SELECTOR
     -------------------------------------------------------------------------- */
  const journeyData = [
    {
      tag: "01 — ACADEMIC FOUNDATION",
      headline: "B.Tech Computer Science",
      body: "B.Tech Computer Science student at Newton School of Technology, Rishihood University. Focusing on mastering core programming fundamentals, algorithmic thinking, and turning classroom concepts into working software experiments.",
      context: "Newton School of Technology, Rishihood University",
      index: "01 / 03"
    },
    {
      tag: "02 — COLLABORATIVE BUILDING",
      headline: "Hackathons & Collaboration",
      body: "Exploring problem-solving, teamwork and practical software development through collaborative technical events—including work on adaptive variable-resolution 2.5D LiDAR mapping for a Smart India Hackathon problem statement.",
      context: "Smart India Hackathon & Team Prototyping",
      index: "02 / 03"
    },
    {
      tag: "03 — DEVELOPER ECOSYSTEM",
      headline: "Open Source & Community",
      body: "Working towards meaningful open-source contributions, stronger engineering fundamentals and active participation in developer communities while exploring AI/ML, cybersecurity and full-stack tooling.",
      context: "Open Source & Continuous Learning",
      index: "03 / 03"
    }
  ];

  const journeyTabs = document.querySelectorAll(".journey__tab");
  const journeyPanelInner = document.getElementById("journey-panel-inner");
  const journeyTag = document.getElementById("journey-tag");
  const journeyHeadline = document.getElementById("journey-headline");
  const journeyBody = document.getElementById("journey-body");
  const journeyContext = document.getElementById("journey-context");
  const journeyIndex = document.getElementById("journey-index");
  const journeyImages = document.querySelectorAll("[data-journey-img]");

  let activeJourney = 0;

  function selectJourney(idx) {
    if (idx === activeJourney || !journeyData[idx] || !journeyPanelInner) return;
    activeJourney = idx;
    trackEvent("journey_select", { stage: journeyData[idx].headline });

    journeyTabs.forEach((tab, i) => {
      const selected = i === idx;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
    });

    journeyImages.forEach((img, i) => {
      img.classList.toggle("is-active", i === idx);
    });

    const entry = journeyData[idx];

    if (prefersReducedMotion) {
      journeyTag.textContent = entry.tag;
      journeyHeadline.textContent = entry.headline;
      journeyBody.textContent = entry.body;
      journeyContext.textContent = entry.context;
      journeyIndex.textContent = entry.index;
      return;
    }

    journeyPanelInner.classList.add("is-switching");
    setTimeout(() => {
      journeyTag.textContent = entry.tag;
      journeyHeadline.textContent = entry.headline;
      journeyBody.textContent = entry.body;
      journeyContext.textContent = entry.context;
      journeyIndex.textContent = entry.index;
      journeyPanelInner.classList.remove("is-switching");
    }, 210);
  }

  journeyTabs.forEach((tab, idx) => {
    tab.addEventListener("click", () => selectJourney(idx));
    tab.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        const next = (idx + 1) % journeyTabs.length;
        journeyTabs[next].focus();
        selectJourney(next);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = (idx - 1 + journeyTabs.length) % journeyTabs.length;
        journeyTabs[prev].focus();
        selectJourney(prev);
      }
    });
  });

  /* --------------------------------------------------------------------------
     9. ACCESSIBLE FAQ ACCORDION
     -------------------------------------------------------------------------- */
  const faqItems = document.querySelectorAll(".faq__item");

  faqItems.forEach((item) => {
    const trigger = item.querySelector(".faq__trigger");
    const panel = item.querySelector(".faq__answer-wrap");
    if (!trigger || !panel) return;

    trigger.addEventListener("click", () => {
      const isExpanded = trigger.getAttribute("aria-expanded") === "true";
      const nextState = !isExpanded;

      trigger.setAttribute("aria-expanded", String(nextState));
      item.classList.toggle("is-open", nextState);
      panel.setAttribute("aria-hidden", String(!nextState));

      if (nextState) {
        trackEvent("faq_open", { question: trigger.textContent.trim().slice(0, 60) });
      }
    });
  });

  /* --------------------------------------------------------------------------
     10. CONTACT EMAIL, SOCIAL LINKS, CLOUDFLARE TURNSTILE & FORM SUBMISSION
     -------------------------------------------------------------------------- */
  const contactEmailEl = document.getElementById("contact-email");
  const contactEmailText = document.getElementById("contact-email-text");
  const contactEmailLabel = document.getElementById("contact-email-label");
  const contactNote = document.getElementById("contact-note");

  function showContactNote(message) {
    if (!contactNote) return;
    contactNote.textContent = message;
    contactNote.classList.add("is-highlighted");
    clearTimeout(showContactNote._timer);
    showContactNote._timer = setTimeout(() => {
      contactNote.classList.remove("is-highlighted");
    }, 2800);
  }

  if (contactEmailEl && contactEmailText) {
    contactEmailText.textContent = PORTFOLIO_CONFIG.email;
    if (PORTFOLIO_CONFIG.emailLive && PORTFOLIO_CONFIG.email) {
      const mailLink = document.createElement("a");
      mailLink.href = `mailto:${PORTFOLIO_CONFIG.email}`;
      mailLink.className = contactEmailEl.className;
      mailLink.id = contactEmailEl.id;
      mailLink.innerHTML = contactEmailEl.innerHTML;
      contactEmailEl.replaceWith(mailLink);
      if (contactEmailLabel) contactEmailLabel.textContent = "Direct Email";
      if (contactNote) contactNote.textContent = "Click to open your default email client.";
    } else {
      contactEmailEl.addEventListener("click", async () => {
        let copied = false;
        if (navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(PORTFOLIO_CONFIG.email);
            copied = true;
          } catch {
            copied = false;
          }
        }
        showContactNote(
          copied
            ? `Copied placeholder (${PORTFOLIO_CONFIG.email}) — update PORTFOLIO_CONFIG.email when live.`
            : "Temporary placeholder — update PORTFOLIO_CONFIG.email in assets/main.js when ready."
        );
      });
    }
  }

  document.querySelectorAll("[data-social-network]").forEach((link) => {
    link.addEventListener("click", () => {
      const network = link.getAttribute("data-social-network");
      if (network) trackEvent("social_click", { network });
    });
  });

  // Cloudflare Turnstile & Contact Form
  const contactForm = document.getElementById("contact-form");
  const turnstileContainer = document.getElementById("turnstile-container");
  const turnstileStatus = document.getElementById("turnstile-status");
  const submitBtn = document.getElementById("contact-submit");
  const formFeedback = document.getElementById("contact-form-feedback");

  let turnstileWidgetId = null;
  let turnstileToken = "";

  function setFormFeedback(message, isError = false) {
    if (!formFeedback) return;
    formFeedback.textContent = message;
    formFeedback.classList.toggle("is-error", isError);
    formFeedback.classList.toggle("is-success", !isError && Boolean(message));
  }

  function initTurnstile() {
    if (!turnstileContainer) return;
    const siteKey = (PORTFOLIO_CONFIG.turnstileSiteKey || "").trim();

    if (!siteKey) {
      if (turnstileStatus) {
        turnstileStatus.textContent =
          "Cloudflare Turnstile awaits your public Site Key (PORTFOLIO_CONFIG.turnstileSiteKey in assets/main.js) and server environment variables before live submissions are enabled.";
      }
      return;
    }

    if (turnstileStatus) turnstileStatus.hidden = true;

    window.onPortfolioTurnstileLoad = function onPortfolioTurnstileLoad() {
      if (!window.turnstile || turnstileWidgetId !== null) return;
      turnstileWidgetId = window.turnstile.render(turnstileContainer, {
        sitekey: siteKey,
        theme: "dark",
        callback: (token) => {
          turnstileToken = token;
        },
        "expired-callback": () => {
          turnstileToken = "";
        },
        "error-callback": () => {
          turnstileToken = "";
          setFormFeedback("Turnstile verification encountered an error. Please retry.", true);
        }
      });
    };

    const tsScript = document.createElement("script");
    tsScript.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onPortfolioTurnstileLoad";
    tsScript.async = true;
    tsScript.defer = true;
    document.head.appendChild(tsScript);
  }

  initTurnstile();

  if (contactForm && submitBtn) {
    contactForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setFormFeedback("");

      const formData = new FormData(contactForm);
      const name = String(formData.get("name") || "").trim();
      const email = String(formData.get("email") || "").trim();
      const subject = String(formData.get("subject") || "").trim();
      const message = String(formData.get("message") || "").trim();
      const website = String(formData.get("website") || "").trim();

      if (name.length < 2) {
        setFormFeedback("Please enter your name (at least 2 characters).", true);
        contactForm.querySelector('[name="name"]')?.focus();
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        setFormFeedback("Please enter a valid email address.", true);
        contactForm.querySelector('[name="email"]')?.focus();
        return;
      }

      if (subject.length < 2) {
        setFormFeedback("Please enter a short subject.", true);
        contactForm.querySelector('[name="subject"]')?.focus();
        return;
      }

      if (message.length < 10) {
        setFormFeedback("Please write a message of at least 10 characters.", true);
        contactForm.querySelector('[name="message"]')?.focus();
        return;
      }

      const hasSiteKey = Boolean((PORTFOLIO_CONFIG.turnstileSiteKey || "").trim());
      if (!hasSiteKey) {
        setFormFeedback(
          "Form backend & Cloudflare Turnstile are configured for deployment, but awaiting your Turnstile Site Key and server email credentials.",
          true
        );
        return;
      }

      if (!turnstileToken) {
        setFormFeedback("Please complete the Cloudflare Turnstile verification check.", true);
        return;
      }

      submitBtn.disabled = true;
      const submitLabelEl = submitBtn.querySelector("span:first-child");
      const originalLabel = submitLabelEl ? submitLabelEl.textContent : submitBtn.textContent;
      if (submitLabelEl) submitLabelEl.textContent = "Sending...";
      else submitBtn.textContent = "Sending...";

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      try {
        const resp = await fetch(PORTFOLIO_CONFIG.contactEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            name,
            email,
            subject,
            message,
            website,
            turnstileToken
          })
        });

        let data = null;
        try {
          data = await resp.json();
        } catch {
          data = null;
        }

        if (resp.ok && data?.ok) {
          trackEvent("contact_form_submit", { status: "success" });
          const safeRedirect =
            typeof data.redirect === "string" && /^\/[a-z0-9\-_/]*$/i.test(data.redirect)
              ? data.redirect
              : "/thank-you/";
          window.location.href = safeRedirect;
          return;
        }

        trackEvent("contact_form_submit", { status: "error", code: resp.status });
        setFormFeedback(
          data?.error ||
            "Submission could not be completed. Ensure the /api/contact backend function and environment variables are active.",
          true
        );

        if (window.turnstile && turnstileWidgetId !== null) {
          window.turnstile.reset(turnstileWidgetId);
          turnstileToken = "";
        }
      } catch {
        setFormFeedback(
          "Unable to reach the submission endpoint (/api/contact). Deploy with Cloudflare Pages Functions or configure contactEndpoint.",
          true
        );
      } finally {
        clearTimeout(timeoutId);
        submitBtn.disabled = false;
        if (submitLabelEl) submitLabelEl.textContent = originalLabel;
        else submitBtn.textContent = originalLabel;
      }
    });
  }
})();
