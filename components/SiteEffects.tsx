"use client";

import { useEffect } from "react";

type NetNav = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

function wantsLite(): boolean {
  if (window.matchMedia("(max-width: 768px)").matches) return true;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  if (window.matchMedia("(prefers-reduced-data: reduce)").matches) return true;
  if (window.matchMedia("(pointer: coarse)").matches) return true;
  const nav = navigator as NetNav;
  if (nav.connection?.saveData) return true;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory > 0 && nav.deviceMemory <= 2) {
    return true;
  }
  return false;
}

function wantsCursor(): boolean {
  if (wantsLite()) return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function clearMotionStyles() {
  document
    .querySelectorAll<HTMLElement>("[data-magnetic], [data-tilt], [data-parallax]")
    .forEach((el) => {
      el.style.transform = "";
      el.style.willChange = "";
    });
}

export function SiteEffects() {
  useEffect(() => {
    const root = document.documentElement;
    const layer = document.createElement("div");
    layer.className = "cursor-layer";
    layer.setAttribute("aria-hidden", "true");
    const ring = document.createElement("div");
    ring.className = "cursor-ring";
    const ringShape = document.createElement("div");
    ringShape.className = "cursor-ring-shape";
    ring.append(ringShape);
    const dot = document.createElement("div");
    dot.className = "cursor-dot";
    layer.append(ring, dot);
    document.body.append(layer);

    const applyMode = () => {
      const lite = wantsLite();
      const cursor = wantsCursor();
      root.classList.toggle("lite-motion", lite);
      root.classList.toggle("has-cursor", cursor);
      if (lite || !cursor) clearMotionStyles();
    };
    applyMode();

    const queries = [
      "(max-width: 768px)",
      "(prefers-reduced-motion: reduce)",
      "(prefers-reduced-data: reduce)",
      "(pointer: coarse)",
      "(hover: hover)",
      "(pointer: fine)",
    ].map((query) => window.matchMedia(query));
    queries.forEach((query) => query.addEventListener("change", applyMode));

    const seen = new Set<Element>();
    const markIn = (el: Element) => el.classList.add("is-in");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          markIn(entry.target);
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    const scan = () => {
      document.querySelectorAll(".reveal").forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) markIn(el);
        else io.observe(el);
      });
    };
    scan();
    root.classList.add("motion-ready");

    let scanFrame = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(scanFrame);
      scanFrame = requestAnimationFrame(scan);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    let px = -400;
    let py = -400;
    let cx = -400;
    let cy = -400;
    let dx = -400;
    let dy = -400;
    let running = false;
    let magnetic: HTMLElement | null = null;
    let tilt: HTMLElement | null = null;
    let magnetPoint = { x: 0, y: 0 };
    let tiltRect: DOMRect | null = null;

    const releaseMagnetic = () => {
      if (!magnetic) return;
      magnetic.style.transform = "";
      magnetic.style.willChange = "";
      magnetic = null;
    };
    const releaseTilt = () => {
      if (!tilt) return;
      tilt.style.transform = "";
      tilt.style.willChange = "";
      tilt = null;
      tiltRect = null;
    };

    const loop = () => {
      running = false;
      if (!root.classList.contains("has-cursor")) return;
      cx += (px - cx) * 0.22;
      cy += (py - cy) * 0.22;
      dx += (px - dx) * 0.48;
      dy += (py - dy) * 0.48;
      ring.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      dot.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      layer.classList.add("is-on");
      if (Math.abs(px - cx) > 0.4 || Math.abs(py - cy) > 0.4) {
        running = true;
        requestAnimationFrame(loop);
      }
    };
    const kick = () => {
      if (running || !root.classList.contains("has-cursor")) return;
      running = true;
      requestAnimationFrame(loop);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      if (!root.classList.contains("has-cursor")) return;
      px = event.clientX;
      py = event.clientY;

      const target = event.target instanceof Element ? event.target : null;
      const nextMagnetic = target?.closest<HTMLElement>("[data-magnetic]") ?? null;
      const magneticAllowed =
        nextMagnetic && nextMagnetic.getAttribute("aria-disabled") !== "true" ? nextMagnetic : null;
      if (magnetic !== magneticAllowed) {
        releaseMagnetic();
        magnetic = magneticAllowed;
        if (magnetic) {
          magnetic.style.transform = "";
          const rect = magnetic.getBoundingClientRect();
          magnetPoint = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          magnetic.style.willChange = "transform";
        }
      }
      if (magnetic) {
        const offsetX = event.clientX - magnetPoint.x;
        const offsetY = event.clientY - magnetPoint.y;
        if (offsetX * offsetX + offsetY * offsetY > 170 * 170) releaseMagnetic();
        else magnetic.style.transform = `translate3d(${offsetX * 0.16}px, ${offsetY * 0.22}px, 0)`;
      }

      const nextTilt = target?.closest<HTMLElement>("[data-tilt]") ?? null;
      if (tilt !== nextTilt) {
        releaseTilt();
        if (nextTilt && window.innerWidth > 768) {
          tilt = nextTilt;
          tilt.style.transform = "";
          tiltRect = tilt.getBoundingClientRect();
          tilt.style.willChange = "transform";
        }
      }
      if (tilt && tiltRect && tiltRect.width > 0 && tiltRect.height > 0) {
        const rx = ((event.clientY - tiltRect.top) / tiltRect.height - 0.5) * -5;
        const ry = ((event.clientX - tiltRect.left) / tiltRect.width - 0.5) * 6;
        tilt.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
      }

      kick();
    };

    const onOver = (event: PointerEvent) => {
      if (!root.classList.contains("has-cursor")) {
        ring.classList.remove("is-hot");
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const hot = target?.closest(
        "a, button, summary, label.feature-card, .card, .lift, input, textarea, select, [data-cursor]",
      );
      ring.classList.toggle("is-hot", Boolean(hot));
    };

    const onOut = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const current = target?.closest<HTMLElement>("[data-tilt]");
      if (!current || current !== tilt) return;
      if (event.relatedTarget instanceof Node && current.contains(event.relatedTarget)) return;
      releaseTilt();
    };

    const onLeave = () => {
      releaseMagnetic();
      releaseTilt();
    };

    let parallaxFrame = 0;
    const onScroll = () => {
      if (root.classList.contains("lite-motion")) return;
      cancelAnimationFrame(parallaxFrame);
      parallaxFrame = requestAnimationFrame(() => {
        const y = window.scrollY;
        document.querySelectorAll<HTMLElement>("[data-parallax]").forEach((el) => {
          const speed = Number(el.dataset.parallax || "0.04");
          const shift = Math.max(-20, Math.min(20, y * speed));
          el.style.transform = `translate3d(0, ${shift}px, 0)`;
        });
      });
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerover", onOver, { passive: true });
    document.addEventListener("pointerout", onOut, { passive: true });
    window.addEventListener("blur", onLeave);
    document.documentElement.addEventListener("mouseleave", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      queries.forEach((query) => query.removeEventListener("change", applyMode));
      io.disconnect();
      mo.disconnect();
      cancelAnimationFrame(scanFrame);
      cancelAnimationFrame(parallaxFrame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      window.removeEventListener("blur", onLeave);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("scroll", onScroll);
      clearMotionStyles();
      layer.remove();
      root.classList.remove("has-cursor", "motion-ready", "lite-motion");
    };
  }, []);

  return null;
}
