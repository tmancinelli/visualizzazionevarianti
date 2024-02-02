class LaCamera {
  #xml;
  #witnesses;
  #enabledWitnesses;

  #selectWitnesses;
  #teiWitness;
  #teiFinal;

  #appPrefix;
  #appCounter;
  #CETEIcean;

  constructor() {
    this.#witnesses = [];

    this.#selectWitnesses = document.getElementById("select-witnesses");
    this.#selectWitnesses.addEventListener("change", () => this.#compareWitness());

    this.#teiWitness = document.getElementById("tei-witness");
    this.#teiFinal = document.getElementById("tei-final");

    this.#CETEIcean = new CETEI({
      ignoreFragmentId: true
    })
    this.#CETEIcean.addBehaviors({
      "tei": {
        "ptr": () => [],
        "note": () => [],
        "app": e => {
          const span = document.createElement('span');
          span.setAttribute('id', `${this.#appPrefix}-${++this.#appCounter}`);
          span.innerHTML = e.innerHTML;
          return span;
        }
      }
    });
  }

  async initialize() {
    const txt = await fetch("data/lacamera_varianti.xml").then(r => r.text());

    const parser = new DOMParser();
    this.#xml = parser.parseFromString(txt,"text/xml");

    const witnesses = this.#xml.getElementsByTagName("witness");

    for (const witness of [...witnesses]) {
      const id = witness.getAttribute('xml:id');
      const dates = [...witness.getElementsByTagName("date")];
      switch (dates.length) {
        case 0:
          console.warn(`Witness ${id} is excluded because it does not contain a "date" tag`);
          this.#witnesses.push({ id, enabled: false, content: null, start: null });
          break;
        case 1:
          this.#witnesses.push({ id, enabled: true, content: dates[0].textContent, start: this.#parseDate(dates[0].getAttribute('when'))});
          break;
        default:
          console.warn(`Witness ${id} is excluded because it contains more than 1 "date" tag`);
          break;
      }
    }

    this.#witnesses.sort((a, b) => a.date < b.date);
    this.#enabledWitnesses = this.#witnesses.filter(wit => wit.enabled);

    this.#validateTei();
  }

  #validateTei() {
    [...this.#xml.getElementsByTagName("witStart")].forEach(ws => {
      for (const witId of ws.getAttribute("wit")?.split(" ")) {
        if (!this.#witnesses.find(wit => witId === `#${wit.id}`)) {
          console.error(`witStart validation: Unable to find wit with ID ${witId}`);
        }
      }
    });

    [...this.#xml.getElementsByTagName("witEnd")].forEach(ws => {
      for (const witId of ws.getAttribute("wit")?.split(" ")) {
        if (!this.#witnesses.find(wit => witId === `#${wit.id}`)) {
          console.error(`witEnd validation: Unable to find wit with ID ${witId}`);
        }
      }
    });

    [...this.#xml.getElementsByTagName("rdg")].filter(ws => ws.hasAttribute("wit")).forEach(ws => {
      for (const witId of ws.getAttribute("wit")?.split(" ")) {
        if (!this.#witnesses.find(wit => witId === `#${wit.id}`)) {
          console.error("BAKU", `rdg validation: Unable to find wit with ID ${witId}`);
        }
      }
    });
  }

  createTimeline() {
    const timeline = new vis.Timeline(document.getElementById("timeline"), new vis.DataSet(this.#enabledWitnesses), {
      height: '200px',
    });

    timeline.on('select', properties => {
      if (properties.items.length === 0) {
        this.#selectWitnesses.value = this.#enabledWitnesses[0].id;
        timeline.setSelection(this.#enabledWitnesses[0].id);
      } else {
        this.#selectWitnesses.value = properties.items[0];
      }

      this.#compareWitness();
    });

    timeline.setSelection(this.#enabledWitnesses[0].id);
  }

  populateWitnesses() {
    this.#enabledWitnesses.forEach(witness => {
      const o = document.createElement("option");
      o.textContent = witness.content;
      o.value = witness.id;
      this.#selectWitnesses.appendChild(o);
    });

    this.#selectWitnesses.value = this.#enabledWitnesses[0].id;

    this.#compareWitness();
  }

  #compareWitness() {
    this.#generateTei(this.#teiWitness, false, "wit", "final");
    this.#generateTei(this.#teiFinal, true, "final", "wit");
  }

  #generateTei(where, forceLem, prefix, otherPrefix) {
    // 0. clone the XML
    const xml = this.#cloneXml();

    // 1. trim the XML
    this.#trimXml(xml, this.#selectWitnesses.value);

    // 2. drop app nodes
    this.#dropAppNodes(xml, this.#selectWitnesses.value, forceLem);

    // TODO: 3. identify the similarity

    // 4. display
    this.#displayXml(xml, where, prefix, otherPrefix);
  }

  #cloneXml() {
    const xml = this.#xml.implementation.createDocument(this.#xml.namespaceURI, null, null);
    xml.appendChild(xml.importNode(this.#xml.documentElement, true));
    return xml;
  }

  #trimXml(xml, id) {
    const witStart = [...xml.getElementsByTagName("witStart")].filter(ws => ws.getAttribute("wit")?.split(" ").includes(`#${id}`));
    if (witStart.length > 1) {
      console.warn(`Too many "witStart" for wit ${id}`);
    }

    if (witStart.length) {
      const rdg = witStart[0].parentNode;
      if (rdg.nodeName !== "rdg") {
        console.log(`Invalid use of "witStart" for id ${id}`);
        return;
      }

      const app = rdg.parentNode;
      if (app.nodeName !== "app") {
        console.log(`Invalid use of "witStart" for id ${id}`);
        return;
      }

      for (let obj = app; obj; obj = obj.parentNode) {
        while (obj.previousSibling) {
          obj.previousSibling.remove();
        }
      }
    }

    const witEnd = [...xml.getElementsByTagName("witEnd")].filter(ws => ws.getAttribute("wit")?.split(" ").includes(`#${id}`));
    if (witEnd.length > 1) {
      console.warn(`Too many "witEnd" for wit ${id}`);
    }

    if (witEnd.length) {
      const rdg = witEnd[0].parentNode;
      if (rdg.nodeName !== "rdg") {
        console.log(`Invalid use of "witEnd" for id ${id}`);
        return;
      }

      const app = rdg.parentNode;
      if (app.nodeName !== "app") {
        console.log(`Invalid use of "witEnd" for id ${id}`);
        return;
      }

      for (let obj = app; obj; obj = obj.parentNode) {
        while (obj.nextSibling) {
          obj.nextSibling.remove();
        }
      }
    }
  }

  #dropAppNodes(xml, id, forceLem) {
    for (const app of [...xml.getElementsByTagName("app")]) {
      const rdgs = [...app.getElementsByTagName("rdg")].filter(ws => ws.getAttribute("wit")?.split(" ").includes(`#${id}`));
      if (rdgs.length > 1) {
        console.warn(`Too many "rdg" for wit ${id}`);
      }

      if (rdgs.length === 0) {
        const lems = [...app.getElementsByTagName("lem")];
        if (lems.length > 1) {
          console.warn(`Too many "lem" for wit ${id}`);
        }

        if (lems.length) {
          while (lems[0].firstChild) {
            app.before(lems[0].firstChild);
          }
        }

        app.remove();
        continue;
      }

      for (const node of [...app.children]) {
        if (!["lem", "rdg"].includes(node.nodeName)) {
          console.warn(`Unsupported node type ${node.nodeName} for tag app in wit ${wid}`);
        }

        if (node.nodeName === 'lem' && forceLem) {
          continue;
        }
 
        if (node === rdgs[0] && !forceLem) {
          continue;
        }

        node.remove();
      }
    }
  }

  #displayXml(xml, where, prefix, otherPrefix) {
    this.#appPrefix = prefix;
    this.#appCounter = 0;

    this.#CETEIcean.domToHTML5(xml, data => {
      while (where.firstChild) {
        where.firstChild.remove();
      }
      where.appendChild(data);
    });

    const overlay = document.createElement('div');
    overlay.classList.add("overlay");

    [...where.getElementsByTagName("span")].filter(s => s.id.startsWith(prefix)).forEach(span => {
      span.addEventListener("mouseover", () => {
        span.classList.add("wit-highlight");
        const otherSpan = document.getElementById(`${otherPrefix}${span.id.slice(prefix.length)}`);
        otherSpan.classList.add("wit-highlight");
      });

      span.addEventListener("mouseout", () => {
        span.classList.remove("wit-highlight");
        const otherSpan = document.getElementById(`${otherPrefix}${span.id.slice(prefix.length)}`);
        otherSpan.classList.remove("wit-highlight");
      });
    });
  }

  #parseDate(str) {
    const parts = str.split("-");
    switch (parts.length) {
      case 0:
        throw new Error("!?!");
      case 1:
        return new Date(parts[0]);
      case 2:
        return new Date(`${parts[1]}-${parts[0]}`);
      case 3:
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      default:
        throw new Error("!?!");
    }
  }
};

const i = new LaCamera();
i.initialize().then(() => {
  i.populateWitnesses();
  i.createTimeline();
});
