(function (factory, window) {
  if (typeof define === "function" && define.amd) {
    define(["leaflet"], factory);
  } else if (typeof exports === "object") {
    module.exports = factory(require("leaflet"));
  }
  if (typeof window !== "undefined" && window.L) {
    window.L.YourPlugin = factory(L);
  }
})(function (L) {
  L.Control.BigImage = L.Control.extend({
    onAdd: function (map) {
      this._map = map;
      return this._createControl(this._print, this);
    },

    _createControl: function (fn, context) {
      this._container = document.createElement("div");
      this._container.id = "print-container";
      this._container.classList.add("leaflet-bar");
      this._createControlPanel(context, fn);
      return this._container;
    },

    _createControlPanel: function (context, fn) {
      let controlPanel = document.createElement("a");
      controlPanel.innerHTML = "Button";
      controlPanel.style.width = "100%";
      controlPanel.style.padding = "0px 10px";

      controlPanel.id = "print-btn";
      L.DomEvent.on(controlPanel, "click", fn, context);
      this._container.appendChild(controlPanel);
    },

    _getLayers: function (resolve) {
      let self = this;
      let promises = [];
      self._map.eachLayer(function (layer) {
        promises.push(
          new Promise((new_resolve) => {
            try {
              if (layer instanceof L.TileLayer)
                self._getTileLayer(layer, new_resolve);
              else new_resolve();
            } catch (e) {
              console.log(e);
              new_resolve();
            }
          })
        );
      });

      Promise.all(promises).then(() => {
        resolve();
      });
    },

    _getTileLayer: function (layer, resolve) {
      let self = this;

      self.tiles = [];
      self.tileSize = layer._tileSize.x;
      self.tileBounds = L.bounds(
        self.bounds.min.divideBy(self.tileSize)._floor(),
        self.bounds.max.divideBy(self.tileSize)._floor()
      );

      for (let j = self.tileBounds.min.y; j <= self.tileBounds.max.y; j++)
        for (let i = self.tileBounds.min.x; i <= self.tileBounds.max.x; i++)
          self.tiles.push(new L.Point(i, j));

      let promiseArray = [];
      self.tiles.forEach((tilePoint) => {
        let originalTilePoint = tilePoint.clone();
        if (layer._adjustTilePoint) layer._adjustTilePoint(tilePoint);

        let tilePos = originalTilePoint
          .scaleBy(new L.Point(self.tileSize, self.tileSize))
          .subtract(self.bounds.min);

        if (tilePoint.y < 0) return;

        promiseArray.push(
          new Promise((resolve) => {
            self._loadTile(tilePoint, tilePos, layer, resolve);
          })
        );
      });

      Promise.all(promiseArray).then(() => {
        resolve();
      });
    },

    _loadTile: function (tilePoint, tilePos, layer, resolve) {
      let self = this;
      let imgIndex = tilePoint.x + ":" + tilePoint.y + ":" + self.zoom;
      self.tilesImgs[layer._leaflet_id] = {};
      let image = new Image();
      image.crossOrigin = "Anonymous";
      image.onload = function () {
        if (!self.tilesImgs[layer._leaflet_id][imgIndex])
          self.tilesImgs[layer._leaflet_id][imgIndex] = {
            img: image,
            x: tilePos.x,
            y: tilePos.y,
          };
        resolve();
      };
      image.src = layer.getTileUrl(tilePoint);
    },
    _print: function () {
      console.log(1);

      let self = this;

      self.tilesImgs = {};

      let dimensions = self._map.getSize();

      self.zoom = self._map.getZoom();
      self.bounds = self._map.getPixelBounds();

      self.canvas = document.createElement("canvas");
      self.canvas.width = dimensions.x;
      self.canvas.height = dimensions.y;
      self.ctx = self.canvas.getContext("2d");

      let promise = new Promise(function (resolve, reject) {
        self._getLayers(resolve);
      });

      promise
        .then(() => {
          return new Promise((resolve, reject) => {
            for (const [key, layer] of Object.entries(self.tilesImgs)) {
              for (const [key, value] of Object.entries(layer)) {
                self.ctx.drawImage(
                  value.img,
                  value.x,
                  value.y,
                  self.tileSize,
                  self.tileSize
                );
              }
            }
            resolve();
          });
        })
        .then(() => {
          self.canvas.toBlob(function (blob) {
            let image = new Image();
            image.onload = function () {
              let zip = new JSZip();
              for (let i = 0; i < 360; i++) {
                let croppedCanvas = document.createElement("canvas");
                let croppedContext = croppedCanvas.getContext("2d");
                let croppedWidth = image.width;
                let croppedHeight = image.height;
                let minSide = Math.min(image.width, image.height);

                croppedCanvas.width = minSide;
                croppedCanvas.height = minSide;

                croppedContext.translate(minSide / 2, minSide / 2);
                croppedContext.rotate(i * (Math.PI / 180));
                croppedContext.drawImage(
                  image,
                  -croppedWidth / 2,
                  -croppedHeight / 2,
                  croppedWidth,
                  croppedHeight
                );
                croppedContext.setTransform(1, 0, 0, 1, 0, 0); // Reset the transformation matrix

                croppedCanvas.toBlob(function (croppedBlob) {
                  zip.file("Image" + i + ".png", croppedBlob);
                }, "image/png");
              }

              zip.generateAsync({ type: "blob" }).then(function (content) {
                let link = document.createElement("a");
                link.download = "croppedImages.zip";
                link.href = URL.createObjectURL(content);

                link.click();

                URL.revokeObjectURL(link.href);
              });
            };
            image.src = URL.createObjectURL(blob);

            let link = document.createElement("a");
            link.download = "bigImage.png";
            link.href = URL.createObjectURL(blob);
            // link.click();
          });
          self._containerParams.classList.remove("print-disabled");
          self._loader.style.display = "none";
        });
    },
  });

  L.control.bigImage = function (options) {
    return new L.Control.BigImage(options);
  };
}, window);
