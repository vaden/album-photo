class PhotoAlbum {
  constructor() {
    this.currentPage = 0;
    this.pages = [];
    this.totalPages = 46; // Nombre total de photos (sans compter les couvertures)
    this.backgrounds = [];
    this.easterEggActive = false;
    this.cachedColors = {};
    this.imageLoadQueue = [];
    this.maxConcurrentLoads = 3;
    this.currentLoads = 0;
    this.isTransitioning = false;
    this.turnJsInitialized = false;
    this.loadedImagesCount = 0;

    // Inclure les couvertures dans la navigation
    this.firstCover = document.querySelector(".first-cover");
    this.lastCover = document.querySelector(".final-cover");

    this.allPages = []; // Tableau qui contiendra toutes les pages (couvertures + photos)

    this.loadBackgrounds();
    this.init();
  }

  loadBackgrounds() {
    for (let i = 1; i <= 9; i++) {
      const img = new Image();
      // Récupérer dynamiquement le nom du dépôt depuis l'URL
      const pathSegments = window.location.pathname.split("/");
      const repoName = pathSegments[1];
      img.src = `/album-photo/assets/images/background${i}.webp`;
      img.style.borderRadius = "20px";
      this.backgrounds.push(`/album-photo/assets/images/background${i}.webp`);
    }
  }

  async init() {
    await this.createPages();
    this.updatePageNumber();
    this.initTurnJs();

    // Initialiser avec la première couverture visible
    this.showPage(0);

    // Jouer la musique de fond lorsque l'album est complètement chargé
    this.playBackgroundMusic();
  }

  async createPages() {
    const pagesContainer = document.getElementById("pages");
    const phrases = await this.loadPhrasesWithCache();

    // Vider le conteneur de pages existant
    pagesContainer.innerHTML = "";
    this.pages = [];

    // Structure pour Turn.js (on ajoute tout dans un seul conteneur)
    const bookContainer = document.createElement("div");
    bookContainer.id = "book";
    pagesContainer.appendChild(bookContainer);

    // Ajouter la couverture
    const firstCoverClone = this.firstCover.cloneNode(true);
    firstCoverClone.style.display = "flex";
    bookContainer.appendChild(firstCoverClone);

    // Créer les pages de photos
    for (let i = 0; i < this.totalPages; i++) {
      const page = document.createElement("div");
      page.className = "page";
      page.setAttribute("data-page-index", i);

      const contentWrapper = document.createElement("div");
      contentWrapper.className = "content-wrapper";

      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.dataset.index = i;

      // Style de base pour toutes les images
      img.style.cssText = `
        max-width: 95%;
        max-height: 80vh;
        object-fit: contain;
      `;

      // Mettre en file d'attente le chargement de l'image
      this.queueImageLoad(img, i, contentWrapper, page, phrases);

      contentWrapper.appendChild(img);
      page.appendChild(contentWrapper);

      this.pages.push(page);
      bookContainer.appendChild(page);
      this.allPages.push(page);
    }

    // Ajouter la dernière couverture
    const lastCoverClone = this.lastCover.cloneNode(true);
    lastCoverClone.style.display = "flex";
    bookContainer.appendChild(lastCoverClone);
    this.allPages.push(lastCoverClone);

    // Commencer à charger les images importantes
    this.loadVisibleImages();
  }

  // Initialiser Turn.js
  initTurnJs() {
    if (this.turnJsInitialized) return;

    // Attendre que les images importantes soient chargées
    setTimeout(() => {
      const bookElement = $("#book");

      // Gestion des touches clavier
      $(document).keydown((e) => {
        if (this.isTransitioning) return;

        if (e.key === "ArrowLeft") {
          this.isTransitioning = true;
          bookElement.turn("previous");
        } else if (e.key === "ArrowRight") {
          this.isTransitioning = true;
          bookElement.turn("next");
        }
      });

      // Gestion du "Go to page"
      $("#goto-btn").on("click", () => {
        if (this.isTransitioning) return;

        const gotoPageInput = document.getElementById("goto-page");
        const pageNumber = parseInt(gotoPageInput.value, 10);

        if (
          !isNaN(pageNumber) &&
          pageNumber >= 1 &&
          pageNumber <= this.allPages.length
        ) {
          this.isTransitioning = true;
          bookElement.turn("page", pageNumber);
        } else {
          alert("Please enter a valid page number.");
        }
      });

      // Configuration plus simple de Turn.js
      bookElement.turn({
        width: window.innerWidth * 0.9,
        height: window.innerHeight * 0.9,
        autoCenter: true,
        display: "single",
        acceleration: false,
        gradients: true,
        elevation: 50,
        when: {
          turning: (event, page, view) => {
            this.currentPage = page - 1;
            this.updatePageNumber();
          },
          turned: (event, page) => {
            this.isTransitioning = false;
          },
        },
      });

      // Configurer les boutons de navigation pour Turn.js
      $(".prev-btn").on("click", () => {
        if (!this.isTransitioning) {
          this.isTransitioning = true;
          bookElement.turn("previous");
        }
      });

      $(".next-btn").on("click", () => {
        if (!this.isTransitioning) {
          this.isTransitioning = true;
          bookElement.turn("next");
        }
      });

      this.turnJsInitialized = true;
    }, 2500);
  }

  queueImageLoad(img, index, contentWrapper, page, phrases) {
    this.imageLoadQueue.push({
      img,
      index,
      contentWrapper,
      page,
      phrases,
      loaded: false,
      priority: index <= 2 ? 0 : 1, // Priorité élevée pour les 3 premières pages
    });
  }

  loadVisibleImages() {
    // Déterminer l'index de page réel (en tenant compte des couvertures)
    const currentRealPage = this.currentPage;

    // Charger en priorité les images actuelles et prochaines
    const startIndex = Math.max(0, currentRealPage - 1);
    const endIndex = Math.min(this.totalPages - 1, currentRealPage + 2);

    // Donner une priorité élevée aux images dans la plage visible
    for (let i = 0; i < this.imageLoadQueue.length; i++) {
      const item = this.imageLoadQueue[i];
      if (item.index >= startIndex && item.index <= endIndex) {
        item.priority = 0;
      }
    }

    // Trier la file d'attente par priorité
    this.imageLoadQueue.sort((a, b) => a.priority - b.priority);

    // Charger les premières images
    this.processImageQueue();
  }

  playBackgroundMusic() {
    const backgroundMusic = document.getElementById("background-music");

    if (backgroundMusic) {
      document.addEventListener(
        "click",
        function () {
          backgroundMusic.volume = 0.07;
          // Essayer de jouer l'audio après un clic quelque part sur la page
          backgroundMusic.play().catch((e) => console.log("Erreur audio:", e));
        },
        { once: true }
      );
    }
  }

  processImageQueue() {
    // Si nous avons atteint le maximum de chargements concurrents, sortir
    if (this.currentLoads >= this.maxConcurrentLoads) {
      return;
    }

    // Trouver la prochaine image non chargée
    const nextItem = this.imageLoadQueue.find((item) => !item.loaded);

    if (!nextItem) {
      return; // Toutes les images sont chargées
    }

    nextItem.loaded = true;
    this.currentLoads++;

    const { img, index, contentWrapper, page, phrases } = nextItem;

    // Assurez-vous que l'image est visible
    img.style.display = "block";

    img.addEventListener("load", async () => {
      if (img.complete && img.naturalHeight !== 0) {
        try {
          // Vérifier si nous avons déjà la couleur en cache
          let avgColor;
          const cacheKey = `image-${index + 1}`;

          if (this.cachedColors[cacheKey]) {
            avgColor = this.cachedColors[cacheKey];
          } else {
            avgColor = await this.getImageAverageColor(img);
            this.cachedColors[cacheKey] = avgColor;
          }

          // Appliquer la couleur de fond
          contentWrapper.style.backgroundColor = `rgba(${avgColor.r}, ${avgColor.g}, ${avgColor.b}, 0.3)`;

          // Sélectionner et appliquer le fond en fonction de la couleur de l'image
          const backgroundImage = this.selectBackgroundByColor(avgColor);
          page.style.backgroundImage = `url(${backgroundImage})`;

          // S'assurer que la page est visible
          $(page).css({
            display: "block",
            visibility: "visible",
            opacity: 1,
          });

          // Corriger la condition pour les phrases - vérifiez si mod 5 fonctionne bien
          // sinon, vous pouvez utiliser une condition différente
          if (index % 5 === 0) {
            // Vérifions si phrases est défini
            if (
              !Array.isArray(nextItem.phrases) ||
              nextItem.phrases.length === 0
            ) {
              console.warn("Aucune phrase disponible pour la page", index + 1);
              // Charger les phrases si nécessaire
              nextItem.phrases = await this.loadPhrasesWithCache();
            }

            const spanishPhrase = document.createElement("p");
            spanishPhrase.className = "spanish-phrase";
            spanishPhrase.textContent = this.getRandomPhrase(phrases);

            this.setPhraseStyle(spanishPhrase, avgColor);

            contentWrapper.appendChild(spanishPhrase);

            page.dataset.hasPhrase = "true";
          }

          // Configuration du clic pour zoomer/easter egg
          this.setupImageInteractions(img, index);

          // Incrémenter le compteur d'images chargées
          this.loadedImagesCount++;

          // Rafraîchir Turn.js tous les 5 images chargées
          if (this.turnJsInitialized && this.loadedImagesCount % 5 === 0) {
            $("#book").turn("resize");
          }

          this.currentLoads--;
          this.processImageQueue();
        } catch (error) {
          console.error(`Error processing image ${index + 1}:`, error);
          this.currentLoads--;
          this.processImageQueue();
        }
      }
    });

    img.addEventListener("error", () => {
      console.error(`Failed to load image ${index + 1}`);
      this.currentLoads--;
      this.processImageQueue();
    });

    // Récupérer dynamiquement le nom du dépôt depuis l'URL
    const pathSegments = window.location.pathname.split("/");
    const repoName = pathSegments[1];

    img.src = `/album-photo/assets/images/colombia-${index + 1}.jpg`;
    img.alt = `Colombia Trip ${index + 1}`;
  }

  setupImageInteractions(img, index) {
    img.addEventListener("click", () => {
      const pageNumber = index + 1;
      const easterEggPages = [4, 8, 12, 16, 18, 22, 26, 30, 34, 38, 42];

      if (easterEggPages.includes(pageNumber) && !this.easterEggActive) {
        this.showEasterEgg();
      }

      this.showFullScreen(img);
    });
  }

  async loadPhrasesWithCache() {
    const cachedPhrases = sessionStorage.getItem("colombiaPhrases");
    if (cachedPhrases) {
      return JSON.parse(cachedPhrases);
    }

    try {
      const response = await fetch("phrases.json");
      const data = await response.json();
      sessionStorage.setItem("colombiaPhrases", JSON.stringify(data.frases));
      return data.frases;
    } catch (error) {
      console.error("Error loading phrases:", error);
      return ["¡Colombia es hermosa!"];
    }
  }

  getImageAverageColor(imgElement) {
    return new Promise((resolve) => {
      try {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        const sampleSize = 50;
        canvas.width = sampleSize;
        canvas.height = sampleSize;

        context.drawImage(
          imgElement,
          0,
          0,
          imgElement.naturalWidth,
          imgElement.naturalHeight,
          0,
          0,
          sampleSize,
          sampleSize
        );
        const data = context.getImageData(0, 0, sampleSize, sampleSize).data;

        let r = 0,
          g = 0,
          b = 0;
        for (let i = 0; i < data.length; i += 16) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }

        const sampledPixels = data.length / 16;
        r = Math.round(r / sampledPixels);
        g = Math.round(g / sampledPixels);
        b = Math.round(b / sampledPixels);

        resolve({ r, g, b });
      } catch (e) {
        console.error("Error calculating average color:", e);
        resolve({ r: 128, g: 128, b: 128 });
      }
    });
  }

  selectBackgroundByColor(color) {
    const brightness = (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
    const index = Math.floor(
      (brightness / 255) * (this.backgrounds.length - 1)
    );
    return this.backgrounds[index];
  }

  getRandomPhrase(phrases) {
    const randomIndex = Math.floor(Math.random() * phrases.length);
    return phrases[randomIndex];
  }

  setPhraseStyle(phrase, avgColor) {
    const positions = ["top-left", "top-right", "bottom-left", "bottom-right"];
    const position = positions[Math.floor(Math.random() * positions.length)];

    // Couleurs du drapeau colombien en HSL
    const colombiaYellow = "hsl(48, 100%, 50%)";
    const colombiaBlue = "hsl(214, 100%, 28%)";
    const colombiaRed = "hsl(352, 85%, 42%)";

    // Appliquer la position
    phrase.classList.add(position);
    phrase.classList.add("phrase");

    // Texte avec gradient aux couleurs de la Colombie au lieu d'un fond
    phrase.style.background = "none"; // Supprimer le fond
    phrase.style.backgroundClip = "text";
    phrase.style.webkitBackgroundClip = "text";
    phrase.style.color = "transparent"; // Nécessaire pour que le gradient soit visible
    phrase.style.webkitTextFillColor = "transparent"; // Pour Safari
    phrase.style.backgroundImage = `linear-gradient(135deg, ${colombiaYellow} 0%, ${colombiaBlue} 50%, ${colombiaRed} 100%)`;

    // Améliorer la visibilité
    phrase.style.padding = "10px 15px";
    phrase.style.fontWeight = "bold";
    phrase.style.textShadow = "1px 1px 2px rgba(0,0,0,0.5)"; // Ombre légère pour la lisibilité
    phrase.style.position = "absolute";
    phrase.style.zIndex = "10";
    phrase.style.maxWidth = "40%";
    phrase.style.textAlign = "center";

    // Ajouter un contour pour améliorer la lisibilité
    phrase.style.webkitTextStroke = "0.5px white"; // Pour Chrome/Safari
    phrase.style.textStroke = "0.5px white"; // Standard (futur)

    // Positionnement plus précis en fonction de la classe
    if (position === "top-left") {
      phrase.style.top = "10%";
      phrase.style.left = "10%";
    } else if (position === "top-right") {
      phrase.style.top = "10%";
      phrase.style.right = "10%";
    } else if (position === "bottom-left") {
      phrase.style.bottom = "10%";
      phrase.style.left = "10%";
    } else if (position === "bottom-right") {
      phrase.style.bottom = "10%";
      phrase.style.right = "10%";
    }
  }

  getContrastColor(color) {
    const brightness = (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
    return brightness > 128 ? "#000" : "#fff";
  }

  // Nouvelle méthode pour afficher une page spécifique (incluant les couvertures)
  showPage(pageIndex) {
    // Cette méthode est remplacée par Turn.js
    if (this.turnJsInitialized) {
      $("#book").turn("page", pageIndex + 1);
      return;
    }

    if (this.isTransitioning) return;
    this.isTransitioning = true;

    // Masquer toutes les pages
    this.hideAllPages();

    // Afficher la page demandée
    const pageToShow = this.allPages[pageIndex];
    if (pageToShow) {
      pageToShow.style.display = "block";
      pageToShow.classList.add("active");
      pageToShow.style.zIndex = "10";

      // Mettre à jour la page courante
      this.currentPage = pageIndex;
      this.updatePageNumber();

      // Précharger les images des pages voisines
      this.loadVisibleImages();
    }

    // Permettre une nouvelle transition après un délai
    setTimeout(() => {
      this.isTransitioning = false;
    }, 100);
  }

  hideAllPages() {
    // Masquer la première couverture
    if (this.firstCover) {
      this.firstCover.style.display = "none";
      this.firstCover.classList.remove("active");
      this.firstCover.style.zIndex = "0";
    }

    // Masquer les pages photos
    this.pages.forEach((page) => {
      page.style.display = "none";
      page.classList.remove("active", "flip", "flip-back");
      page.style.zIndex = "0";
    });

    // Masquer la dernière couverture
    if (this.lastCover) {
      this.lastCover.style.display = "none";
      this.lastCover.classList.remove("active");
      this.lastCover.style.zIndex = "0";
    }
  }

  showEasterEgg() {
    if (this.easterEggActive) return;
    this.easterEggActive = true;

    const easterEggContainer = document.createElement("div");
    easterEggContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1001;
      pointer-events: none;
    `;

    const numberOfEasterEggs = 33;
    const selectedEasterEggs = [];
    const eggSize = 100;
    const occupiedAreas = [];

    while (selectedEasterEggs.length < 3) {
      const randomIndex = Math.floor(Math.random() * numberOfEasterEggs) + 1;
      if (!selectedEasterEggs.includes(randomIndex)) {
        selectedEasterEggs.push(randomIndex);
      }
    }

    selectedEasterEggs.forEach((index) => {
      const easterEggImg = document.createElement("img");
      easterEggImg.style.opacity = "0";
      easterEggImg.onload = () => {
        easterEggImg.style.opacity = "1";
      };

      const padding = 20;
      const maxX = window.innerWidth - eggSize - padding;
      const maxY = window.innerHeight - eggSize - padding;
      const minX = padding;
      const minY = padding;

      let validPosition = false;
      let randomX, randomY;
      let attempts = 0;
      const maxAttempts = 50;

      while (!validPosition && attempts < maxAttempts) {
        randomX = Math.floor(Math.random() * (maxX - minX)) + minX;
        randomY = Math.floor(Math.random() * (maxY - minY)) + minY;

        validPosition = true;

        for (const area of occupiedAreas) {
          const distanceX = Math.abs(area.x - randomX);
          const distanceY = Math.abs(area.y - randomY);
          const distance = Math.sqrt(
            distanceX * distanceX + distanceY * distanceY
          );

          if (distance < eggSize + 10) {
            validPosition = false;
            break;
          }
        }

        attempts++;
      }

      if (validPosition) {
        occupiedAreas.push({ x: randomX, y: randomY, size: eggSize });
      }

      easterEggImg.style.cssText = `
        position: absolute;
        width: ${eggSize}px;
        height: ${eggSize}px;
        object-fit: cover;
        border-radius: 50%;
        left: ${randomX}px;
        top: ${randomY}px;
        transition: opacity 0.3s ease-in-out;
        opacity: 0;
      `;
      // Récupérer dynamiquement le nom du dépôt depuis l'URL
      const pathSegments = window.location.pathname.split("/");
      const repoName = pathSegments[1];
      easterEggContainer.appendChild(easterEggImg);
      easterEggImg.src = `/album-photo/assets/images/easter-eggs/easter-egg-${index}.jpg`;
    });

    document.body.appendChild(easterEggContainer);

    setTimeout(() => {
      const eggs = easterEggContainer.querySelectorAll("img");
      eggs.forEach((egg) => {
        egg.style.opacity = "0";
      });

      setTimeout(() => {
        easterEggContainer.remove();
        this.easterEggActive = false;
      }, 300);
    }, 2700);
  }

  showFullScreen(img) {
    const fullScreen = document.createElement("div");
    fullScreen.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
      cursor: zoom-out;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    const fullImg = document.createElement("img");
    fullImg.style.cssText = `
      max-width: 95vw;
      max-height: 95vh;
      object-fit: contain;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    fullImg.onload = () => {
      requestAnimationFrame(() => {
        fullScreen.style.opacity = "1";
        fullImg.style.opacity = "1";
      });
    };

    fullScreen.appendChild(fullImg);

    fullScreen.addEventListener("click", () => {
      fullScreen.style.opacity = "0";
      setTimeout(() => fullScreen.remove(), 300);
    });

    document.body.appendChild(fullScreen);
    fullImg.src = img.src;
  }

  updatePageNumber() {
    const pageNumberDisplay = document.getElementById("page-number");
    if (pageNumberDisplay) {
      pageNumberDisplay.textContent = `${this.currentPage + 1}/${
        this.allPages.length
      }`;
    }
  }
}

// Démarrer l'application après le chargement du DOM
// Initialisation modifiée pour charger jQuery et Turn.js
window.addEventListener("DOMContentLoaded", () => {
  // Ajouter jQuery au document
  const jqueryScript = document.createElement("script");
  jqueryScript.src =
    "https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js";
  jqueryScript.onload = () => {
    // Après avoir chargé jQuery, charger Turn.js
    const turnScript = document.createElement("script");
    turnScript.src =
      "https://cdnjs.cloudflare.com/ajax/libs/turn.js/3/turn.min.js";
    turnScript.onload = () => {
      // Une fois Turn.js chargé, initialiser l'album
      const album = new PhotoAlbum();

      // Ajouter un indicateur de chargement
      const loadingIndicator = document.createElement("div");
      loadingIndicator.id = "loading-indicator";
      loadingIndicator.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        z-index: 1000;
      `;
      loadingIndicator.textContent = "Chargement de l'album...";
      document.body.appendChild(loadingIndicator);

      // Supprimer l'indicateur de chargement après quelques secondes
      setTimeout(() => {
        loadingIndicator.style.opacity = "0";
        loadingIndicator.style.transition = "opacity 0.5s ease";
        setTimeout(() => {
          loadingIndicator.remove();
        }, 500);
      }, 2500); // Augmenté pour donner plus de temps à Turn.js
    };
    document.head.appendChild(turnScript);
  };
  document.head.appendChild(jqueryScript);
});
