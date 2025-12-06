"use client";

import { useEffect, useRef } from "react";

/**
 * Animated crypto-themed background with:
 * - Floating blockchain nodes
 * - Connecting lines between nodes
 * - Glowing orbs
 * - Subtle grid pattern
 * - Particle effects
 */
export function CryptoBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Particle[] = [];
    let nodes: Node[] = [];
    let mouseX = 0;
    let mouseY = 0;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initializeElements();
    };

    // Particle class for floating elements
    class Particle {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      opacity: number;
      color: string;
      type: "circle" | "diamond" | "hex";

      constructor() {
        this.x = Math.random() * canvas!.width;
        this.y = Math.random() * canvas!.height;
        this.size = Math.random() * 3 + 1;
        this.speedX = (Math.random() - 0.5) * 0.5;
        this.speedY = (Math.random() - 0.5) * 0.5;
        this.opacity = Math.random() * 0.5 + 0.2;
        this.color = this.getRandomColor();
        this.type = ["circle", "diamond", "hex"][Math.floor(Math.random() * 3)] as any;
      }

      getRandomColor(): string {
        const colors = [
          "139, 92, 246", // Purple
          "59, 130, 246", // Blue
          "16, 185, 129", // Green
          "236, 72, 153", // Pink
          "245, 158, 11", // Amber
        ];
        return colors[Math.floor(Math.random() * colors.length)];
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;

        // Mouse interaction - subtle attraction
        const dx = mouseX - this.x;
        const dy = mouseY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 150) {
          this.x += dx * 0.002;
          this.y += dy * 0.002;
        }

        // Wrap around edges
        if (this.x < 0) this.x = canvas!.width;
        if (this.x > canvas!.width) this.x = 0;
        if (this.y < 0) this.y = canvas!.height;
        if (this.y > canvas!.height) this.y = 0;
      }

      draw() {
        if (!ctx) return;
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = `rgba(${this.color}, 1)`;

        if (this.type === "circle") {
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (this.type === "diamond") {
          ctx.translate(this.x, this.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-this.size, -this.size, this.size * 2, this.size * 2);
        } else {
          // Hexagon
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const x = this.x + this.size * Math.cos(angle);
            const y = this.y + this.size * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // Node class for blockchain-like network
    class Node {
      x: number;
      y: number;
      targetX: number;
      targetY: number;
      size: number;
      pulsePhase: number;
      color: string;
      connections: number[];

      constructor(index: number) {
        this.x = Math.random() * canvas!.width;
        this.y = Math.random() * canvas!.height;
        this.targetX = this.x;
        this.targetY = this.y;
        this.size = Math.random() * 4 + 3;
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.color = index % 3 === 0 ? "139, 92, 246" : index % 3 === 1 ? "59, 130, 246" : "16, 185, 129";
        this.connections = [];
      }

      update(time: number) {
        // Slow floating movement
        if (Math.random() < 0.01) {
          this.targetX = this.x + (Math.random() - 0.5) * 100;
          this.targetY = this.y + (Math.random() - 0.5) * 100;
        }

        this.x += (this.targetX - this.x) * 0.01;
        this.y += (this.targetY - this.y) * 0.01;

        // Keep in bounds
        this.x = Math.max(50, Math.min(canvas!.width - 50, this.x));
        this.y = Math.max(50, Math.min(canvas!.height - 50, this.y));

        this.pulsePhase = time * 0.002;
      }

      draw(time: number) {
        if (!ctx) return;
        const pulse = Math.sin(this.pulsePhase + time * 0.001) * 0.3 + 0.7;

        // Glow effect
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size * 4);
        gradient.addColorStop(0, `rgba(${this.color}, ${0.3 * pulse})`);
        gradient.addColorStop(1, `rgba(${this.color}, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 4, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = `rgba(${this.color}, ${0.8 * pulse})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();

        // Inner bright spot
        ctx.fillStyle = `rgba(255, 255, 255, ${0.6 * pulse})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Initialize particles and nodes
    const initializeElements = () => {
      particles = [];
      nodes = [];

      // Create particles
      const particleCount = Math.min(80, Math.floor((canvas!.width * canvas!.height) / 15000));
      for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
      }

      // Create nodes
      const nodeCount = Math.min(12, Math.floor((canvas!.width * canvas!.height) / 80000));
      for (let i = 0; i < nodeCount; i++) {
        nodes.push(new Node(i));
      }

      // Create connections between nearby nodes
      nodes.forEach((node, i) => {
        nodes.forEach((otherNode, j) => {
          if (i !== j) {
            const dx = node.x - otherNode.x;
            const dy = node.y - otherNode.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < 300 && node.connections.length < 3) {
              node.connections.push(j);
            }
          }
        });
      });
    };

    // Draw grid pattern
    const drawGrid = () => {
      if (!ctx) return;
      ctx.strokeStyle = "rgba(139, 92, 246, 0.03)";
      ctx.lineWidth = 1;

      const gridSize = 50;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    };

    // Draw connections between nodes
    const drawConnections = (time: number) => {
      if (!ctx) return;
      nodes.forEach((node, i) => {
        node.connections.forEach(j => {
          const otherNode = nodes[j];
          if (!otherNode) return;

          const dx = otherNode.x - node.x;
          const dy = otherNode.y - node.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 400) {
            const opacity = (1 - distance / 400) * 0.2;
            const pulse = Math.sin(time * 0.001 + i) * 0.1 + 0.9;

            // Create gradient along the line
            const gradient = ctx.createLinearGradient(node.x, node.y, otherNode.x, otherNode.y);
            gradient.addColorStop(0, `rgba(${node.color}, ${opacity * pulse})`);
            gradient.addColorStop(0.5, `rgba(139, 92, 246, ${opacity * pulse * 1.5})`);
            gradient.addColorStop(1, `rgba(${otherNode.color}, ${opacity * pulse})`);

            ctx.strokeStyle = gradient;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(otherNode.x, otherNode.y);
            ctx.stroke();

            // Animated data packet along the line
            const packetPos = (time * 0.0005 + i * 0.1) % 1;
            const packetX = node.x + dx * packetPos;
            const packetY = node.y + dy * packetPos;

            ctx.fillStyle = `rgba(255, 255, 255, ${0.6 * pulse})`;
            ctx.beginPath();
            ctx.arc(packetX, packetY, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      });
    };

    // Animation loop
    const animate = (time: number) => {
      if (!ctx) return;

      // Clear with fade effect
      ctx.fillStyle = "rgba(10, 10, 20, 0.1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw background elements
      drawGrid();

      // Update and draw particles
      particles.forEach(particle => {
        particle.update();
        particle.draw();
      });

      // Draw connections
      drawConnections(time);

      // Update and draw nodes
      nodes.forEach(node => {
        node.update(time);
        node.draw(time);
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    // Mouse tracking
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    // Initialize
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("mousemove", handleMouseMove);

    // Start animation
    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 0, background: "linear-gradient(135deg, #0a0a14 0%, #1a1a2e 50%, #0f0f1a 100%)" }}
      />
      {/* Overlay gradient for better readability */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background: "radial-gradient(ellipse at center, transparent 0%, rgba(10, 10, 20, 0.4) 100%)",
        }}
      />
    </>
  );
}

/**
 * Floating crypto icons that move around the screen
 */
export function FloatingCryptoIcons() {
  const icons = ["₿", "Ξ", "◎", "⟐", "◈", "⬡", "⬢", "◇"];

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 2 }}>
      {icons.map((icon, i) => (
        <div
          key={i}
          className="absolute text-4xl opacity-10 animate-float"
          style={{
            left: `${10 + i * 12}%`,
            top: `${20 + (i % 3) * 25}%`,
            animationDelay: `${i * 0.5}s`,
            animationDuration: `${15 + i * 2}s`,
          }}
        >
          {icon}
        </div>
      ))}
    </div>
  );
}

/**
 * Glowing orbs in the corners
 */
export function GlowingOrbs() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
      {/* Top left orb - Purple */}
      <div
        className="absolute -top-32 -left-32 w-96 h-96 rounded-full animate-pulse-slow"
        style={{
          background: "radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)",
        }}
      />
      {/* Top right orb - Blue */}
      <div
        className="absolute -top-48 -right-48 w-[500px] h-[500px] rounded-full animate-pulse-slow"
        style={{
          background: "radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, transparent 70%)",
          animationDelay: "1s",
        }}
      />
      {/* Bottom left orb - Green */}
      <div
        className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full animate-pulse-slow"
        style={{
          background: "radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, transparent 70%)",
          animationDelay: "2s",
        }}
      />
      {/* Bottom right orb - Pink */}
      <div
        className="absolute -bottom-48 -right-48 w-[450px] h-[450px] rounded-full animate-pulse-slow"
        style={{
          background: "radial-gradient(circle, rgba(236, 72, 153, 0.1) 0%, transparent 70%)",
          animationDelay: "0.5s",
        }}
      />
      {/* Center orb - Amber */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full animate-pulse-slow"
        style={{
          background: "radial-gradient(circle, rgba(245, 158, 11, 0.05) 0%, transparent 60%)",
          animationDelay: "1.5s",
        }}
      />
    </div>
  );
}
