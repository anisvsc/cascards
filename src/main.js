// Platform check for non-PC devices
if (/Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
  document.body.innerHTML = `
    <div style="display:flex;justify-content:center;align-items:center;height:100vh;text-align:center;padding:20px;font-family:sans-serif;">
      <h1 style="font-size:20px">Only available for PC</h1>
    </div>
  `;
  throw new Error("This application is only available for PC.");
}

import gsap from "gsap";
import { CustomEase } from "gsap/all";
import SplitType from "split-type";
import items from "./items.js";

// Register GSAP plugins and create custom easing
gsap.registerPlugin(CustomEase);
CustomEase.create("hop", "0.9, 0, 0.1, 1");

// DOM element references
const container = document.querySelector(".container");
const canvas = document.querySelector(".canvas");
const overlay = document.querySelector(".overlay");
const projectTitleElement = document.querySelector(".project-title p");

// Debug: Check if elements exist
console.log("DOM Elements:", {
  container: !!container,
  canvas: !!canvas,
  overlay: !!overlay,
  projectTitleElement: !!projectTitleElement,
  itemsLoaded: !!items,
  itemsLength: items?.length,
});

// Grid configuration constants
const itemCount = 20; // Total number of unique images
const itemGap = 120; // Space between grid items
const columns = 4; // Number of columns (used for item selection)
const itemWidth = 200; // Width of each grid item
const itemHeight = 200; // Height of each grid item

// Dragging state variables
let isDragging = false;
let startX = 0,
  startY = 0;
let targetX = 0,
  targetY = 0;
let currentX = 0,
  currentY = 0;
let dragVelocityX = 0,
  dragVelocityY = 0;
let lastDragTime = 0;
let mouseHasMoved = false;

// Performance optimization variables
let visibleItems = new Set();
let lastUpdateTime = 0;
let lastX = 0,
  lastY = 0;

// Expansion state variables
let isExpanded = false;
let activeItem = null;
let canDrag = true;
let originalPosition = null;
let expandedItem = null;
let activeItemId = null;
let titleSplit = null;

/**
 * Sets up and prepares the title for animation
 * @param {string} title - The title text to display
 */
function setAndAnimateTitle(title) {
  console.log("Setting title:", title); // Debug log

  if (!projectTitleElement) {
    console.error("Project title element not found");
    return;
  }

  // Clean up previous split instance
  if (titleSplit) {
    try {
      titleSplit.revert();
    } catch (e) {
      console.warn("Error reverting previous SplitType:", e);
    }
    titleSplit = null;
  }

  // Set new title content
  projectTitleElement.textContent = title;

  // Ensure the title container is visible immediately
  const titleContainer = document.querySelector(".project-title");
  if (titleContainer) {
    titleContainer.style.display = "block";
    titleContainer.style.visibility = "visible";
  }

  try {
    // Create split instance
    titleSplit = new SplitType(projectTitleElement, { type: "words" });

    // Check if split was successful
    if (titleSplit.words && titleSplit.words.length > 0) {
      console.log("SplitType successful, words:", titleSplit.words.length);
      // Set initial state for animation (words moved down)
      gsap.set(titleSplit.words, { y: "100%" });
    } else {
      console.warn("SplitType failed to create words, using fallback");
      titleSplit = null;
      // Fallback: just set the text and make it visible
      gsap.set(projectTitleElement, { opacity: 0, y: 20 });
    }
  } catch (e) {
    console.warn("SplitType initialization failed:", e);
    titleSplit = null;
    // Fallback: just set the text and make it visible
    gsap.set(projectTitleElement, { opacity: 0, y: 20 });
  }
}

/**
 * Animates the title words sliding up into view
 */
function animateTitleIn() {
  console.log("Animating title in"); // Debug log

  if (!projectTitleElement) {
    console.error("No title element for animation");
    return;
  }

  // Ensure title container is visible
  const titleContainer = document.querySelector(".project-title");
  if (titleContainer) {
    titleContainer.style.display = "block";
    titleContainer.style.visibility = "visible";
    titleContainer.style.opacity = "1";
  }

  if (titleSplit && titleSplit.words && titleSplit.words.length > 0) {
    console.log("Using SplitType animation");
    // Use SplitType animation
    gsap.to(titleSplit.words, {
      y: "0%",
      duration: 1,
      stagger: 0.1,
      ease: "power3.out",
      onComplete: () => console.log("Title animation complete"),
    });
  } else {
    console.log("Using fallback animation");
    // Fallback animation
    gsap.to(projectTitleElement, {
      opacity: 1,
      y: 0,
      duration: 1,
      ease: "power3.out",
      onComplete: () => console.log("Fallback title animation complete"),
    });
  }
}

/**
 * Animates the title words sliding up out of view
 */
function animateTitleOut() {
  console.log("Animating title out"); // Debug log

  if (!projectTitleElement) return;

  if (titleSplit && titleSplit.words && titleSplit.words.length > 0) {
    // Use SplitType animation
    gsap.to(titleSplit.words, {
      y: "-100%",
      duration: 1,
      stagger: 0.1,
      ease: "power3.out",
    });
  } else {
    // Fallback animation
    gsap.to(projectTitleElement, {
      opacity: 0,
      y: -20,
      duration: 1,
      ease: "power3.out",
    });
  }
}

/**
 * Updates which items are visible based on current viewport and position
 */
function updateVisibleItems() {
  const buffer = 2.5;
  const viewWidth = window.innerWidth * (1 + buffer);
  const viewHeight = window.innerHeight * (1 + buffer);

  const movingRight = targetX > currentX;
  const movingDown = targetY > currentY;
  const directionBufferX = movingRight ? -300 : 300;
  const directionBufferY = movingDown ? -300 : 300;

  const startCol = Math.floor((-currentX - viewWidth / 2 + (movingRight ? directionBufferX : 0)) / (itemWidth + itemGap));
  const endCol = Math.ceil((-currentX + viewWidth * 1.5 + (!movingRight ? directionBufferX : 0)) / (itemWidth + itemGap));
  const startRow = Math.floor((-currentY - viewHeight / 2 + (movingDown ? directionBufferY : 0)) / (itemHeight + itemGap));
  const endRow = Math.ceil((-currentY + viewHeight * 1.5 + (!movingDown ? directionBufferY : 0)) / (itemHeight + itemGap));

  const currentItems = new Set();

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const itemId = `${col},${row}`;
      currentItems.add(itemId);

      if (visibleItems.has(itemId)) continue;
      if (activeItemId === itemId && isExpanded) continue;

      const item = document.createElement("div");
      item.className = "item";
      item.id = itemId;
      item.style.left = `${col * (itemWidth + itemGap)}px`;
      item.style.top = `${row * (itemHeight + itemGap)}px`;
      item.dataset.col = col;
      item.dataset.row = row;

      const itemNum = (Math.abs(row * columns + col) % itemCount) + 1;
      const img = document.createElement("img");
      img.src = `/img/${itemNum}.jpg`;
      img.alt = `Image ${itemNum}`;
      img.loading = "lazy";

      img.onerror = function () {
        console.warn(`Failed to load image: ${this.src}`);
        this.src = "/img/1.jpg";
      };

      item.appendChild(img);

      item.addEventListener("click", (e) => {
        if (mouseHasMoved || isDragging) return;
        handleItemClick(item);
      });

      canvas.appendChild(item);
      visibleItems.add(itemId);
    }
  }

  visibleItems.forEach((itemId) => {
    if (!currentItems.has(itemId) || (activeItemId === itemId && isExpanded)) {
      const item = document.getElementById(itemId);
      if (item && item.parentNode) {
        canvas.removeChild(item);
      }
      visibleItems.delete(itemId);
    }
  });
}

/**
 * Handles clicking on a grid item
 */
function handleItemClick(item) {
  console.log("Item clicked:", item.id); // Debug log

  if (isExpanded) {
    if (expandedItem) closeExpandedItem();
  } else {
    expandItem(item);
  }
}

/**
 * Expands a grid item to full view with animation
 */
function expandItem(item) {
  console.log("Expanding item:", item.id); // Debug log

  // Validate items array
  if (!items || !Array.isArray(items) || items.length === 0) {
    console.error("Items array is missing or empty:", items);
    return;
  }

  // Set expansion state
  isExpanded = true;
  activeItem = item;
  activeItemId = item.id;
  canDrag = false;
  container.style.cursor = "auto";

  // Get image info
  const imgElement = item.querySelector("img");
  if (!imgElement) {
    console.error("No image found in item");
    return;
  }

  const imgSrc = imgElement.src;
  const imgMatch = imgSrc.match(/\/img\/(\d+)\.jpg/);
  const imgNum = imgMatch ? parseInt(imgMatch[1]) : 1;

  console.log("Image number:", imgNum); // Debug log

  // Calculate title index with better bounds checking
  const titleIndex = (((imgNum - 1) % items.length) + items.length) % items.length;
  const itemTitle = items[titleIndex];

  console.log("Title index:", titleIndex, "Title:", itemTitle); // Debug log

  // Validate title and set it
  if (typeof itemTitle === "string" && itemTitle.trim()) {
    setAndAnimateTitle(itemTitle);
  } else {
    console.warn(`Invalid title at index ${titleIndex}:`, itemTitle);
    setAndAnimateTitle(`Project ${imgNum}`);
  }

  // Hide original item
  item.style.visibility = "hidden";

  // Store original position
  const rect = item.getBoundingClientRect();
  originalPosition = {
    id: item.id,
    rect: rect,
    imgSrc: imgSrc,
  };

  // Show overlay
  overlay.classList.add("active");

  // Create expanded item
  expandedItem = document.createElement("div");
  expandedItem.className = "expanded-item";
  expandedItem.style.width = `${itemWidth}px`;
  expandedItem.style.height = `${itemHeight}px`;
  expandedItem.style.position = "fixed";
  expandedItem.style.zIndex = "1000";
  expandedItem.style.left = "50%";
  expandedItem.style.top = "50%";
  expandedItem.style.transform = "translate(-50%, -50%)";

  const img = document.createElement("img");
  img.src = imgSrc;
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "cover";
  expandedItem.appendChild(img);

  expandedItem.addEventListener("click", closeExpandedItem);
  document.body.appendChild(expandedItem);

  // Fade out other items
  document.querySelectorAll(".item").forEach((el) => {
    if (el !== activeItem) {
      gsap.to(el, { opacity: 0, duration: 0.3, ease: "power2.out" });
    }
  });

  // Calculate target size
  const viewportWidth = window.innerWidth;
  const targetWidth = Math.min(viewportWidth * 0.4, 600);
  const targetHeight = targetWidth * 1.2;

  // Animate title in after shorter delay
  gsap.delayedCall(0.3, animateTitleIn);

  // Animate expansion
  gsap.fromTo(
    expandedItem,
    {
      width: itemWidth,
      height: itemHeight,
      x: rect.left + itemWidth / 2 - window.innerWidth / 2,
      y: rect.top + itemHeight / 2 - window.innerHeight / 2,
    },
    {
      width: targetWidth,
      height: targetHeight,
      x: 0,
      y: 0,
      duration: 1,
      ease: "hop",
    }
  );
}

/**
 * Closes the expanded item and returns to grid view
 */
function closeExpandedItem() {
  console.log("Closing expanded item"); // Debug log

  if (!expandedItem || !originalPosition) return;

  // Animate title out
  animateTitleOut();

  // Hide overlay
  overlay.classList.remove("active");

  // Hide title container after animation
  gsap.delayedCall(0.5, () => {
    const titleContainer = document.querySelector(".project-title");
    if (titleContainer) {
      titleContainer.style.opacity = "0";
    }
  });

  const originalRect = originalPosition.rect;
  const originalItem = document.getElementById(activeItemId);

  // Animate back
  gsap.to(expandedItem, {
    width: itemWidth,
    height: itemHeight,
    x: originalRect.left + itemWidth / 2 - window.innerWidth / 2,
    y: originalRect.top + itemHeight / 2 - window.innerHeight / 2,
    duration: 1,
    ease: "hop",
    onComplete: () => {
      // Clean up
      if (expandedItem && expandedItem.parentNode) {
        document.body.removeChild(expandedItem);
      }

      if (originalItem) {
        originalItem.style.visibility = "visible";
      }

      // Fade in other items
      document.querySelectorAll(".item").forEach((el) => {
        if (el !== activeItem) {
          gsap.to(el, { opacity: 1, duration: 0.3, ease: "power2.out" });
        }
      });

      // Reset state
      expandedItem = null;
      isExpanded = false;
      activeItem = null;
      originalPosition = null;
      activeItemId = null;
      canDrag = true;
      container.style.cursor = "grab";
      dragVelocityX = 0;
      dragVelocityY = 0;
    },
  });
}

/**
 * Main animation loop
 */
function animate() {
  if (canDrag) {
    const ease = 0.075;
    currentX += (targetX - currentX) * ease;
    currentY += (targetY - currentY) * ease;

    canvas.style.transform = `translate(${currentX}px, ${currentY}px)`;

    const now = Date.now();
    const distMoved = Math.sqrt((currentX - lastX) ** 2 + (currentY - lastY) ** 2);

    if (distMoved > 100 || now - lastUpdateTime > 120) {
      updateVisibleItems();
      lastX = currentX;
      lastY = currentY;
      lastUpdateTime = now;
    }
  }

  requestAnimationFrame(animate);
}

// Mouse events
container.addEventListener("mousedown", (e) => {
  if (!canDrag) return;
  isDragging = true;
  mouseHasMoved = false;
  startX = e.clientX;
  startY = e.clientY;
  container.style.cursor = "grabbing";
  e.preventDefault();
});

window.addEventListener("mousemove", (e) => {
  if (!isDragging || !canDrag) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
    mouseHasMoved = true;
  }

  targetX += dx;
  targetY += dy;

  const now = Date.now();
  const dt = Math.max(10, now - lastDragTime);
  lastDragTime = now;

  dragVelocityX = dx / dt;
  dragVelocityY = dy / dt;

  startX = e.clientX;
  startY = e.clientY;
});

window.addEventListener("mouseup", (e) => {
  if (!isDragging) return;
  isDragging = false;

  if (canDrag) {
    container.style.cursor = "grab";
    if (Math.abs(dragVelocityX) > 0.1 || Math.abs(dragVelocityY) > 0.1) {
      const momentumFactor = 200;
      targetX += dragVelocityX * momentumFactor;
      targetY += dragVelocityY * momentumFactor;
    }
  }

  dragVelocityX = 0;
  dragVelocityY = 0;
});

// Overlay click
overlay.addEventListener("click", () => {
  if (isExpanded) closeExpandedItem();
});

// Touch events
container.addEventListener(
  "touchstart",
  (e) => {
    if (!canDrag) return;
    isDragging = true;
    mouseHasMoved = false;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    e.preventDefault();
  },
  { passive: false }
);

window.addEventListener(
  "touchmove",
  (e) => {
    if (!isDragging || !canDrag) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      mouseHasMoved = true;
    }

    targetX += dx;
    targetY += dy;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    e.preventDefault();
  },
  { passive: false }
);

window.addEventListener("touchend", () => {
  isDragging = false;
  dragVelocityX = 0;
  dragVelocityY = 0;
});

// Resize handling
window.addEventListener("resize", () => {
  if (isExpanded && expandedItem) {
    const viewportWidth = window.innerWidth;
    const targetWidth = Math.min(viewportWidth * 0.4, 600);
    const targetHeight = targetWidth * 1.2;

    gsap.to(expandedItem, {
      width: targetWidth,
      height: targetHeight,
      duration: 0.3,
      ease: "power2.out",
    });
  } else {
    updateVisibleItems();
  }
});

// Keyboard support
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isExpanded) {
    closeExpandedItem();
  }
});

// Error handling and initialization
if (!container || !canvas || !overlay || !projectTitleElement) {
  console.error("Required DOM elements not found. Missing elements:", {
    container: !container,
    canvas: !canvas,
    overlay: !overlay,
    projectTitleElement: !projectTitleElement,
  });
} else {
  console.log("Initializing application...");
  updateVisibleItems();
  animate();
}
