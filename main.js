class LaCamera {
  #xml;
  #witnesses;
  #enabledWitnesses;

  #selectWitnessesA;
  #selectWitnessesB;

  #tei;
  #teiA;
  #teiB;

  constructor() {
    this.#witnesses = [];

    this.#selectWitnessesA = document.getElementById("select-witnesses-a");
    this.#selectWitnessesA.addEventListener("change", () => this.#compareWitness());

    this.#selectWitnessesB = document.getElementById("select-witnesses-b");
    this.#selectWitnessesB.addEventListener("change", () => this.#compareWitness());

    this.#teiA = document.getElementById("tei-A");
    this.#teiB = document.getElementById("tei-B");
    this.#tei = document.getElementById("tei");
  }

  async initialize() {
    await this.#initializeMain();
    await this.#initializeManuscript();

    this.#witnesses.sort((a, b) => a.start > b.start);
    this.#enabledWitnesses = this.#witnesses.filter(wit => wit.enabled);
  }

  async #initializeMain() {
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
          const rdgs = [...this.#xml.getElementsByTagName("rdg")].filter(ws => ws.getAttribute("wit")?.split(" ").includes(`#${id}`));
          this.#witnesses.push({ id, enabled: rdgs.length > 0, content: dates[0].textContent, start: this.#parseDate(dates[0].getAttribute('when')), xml: this.#generateTei(this.#xml, id, false)});
          break;
        default:
          console.warn(`Witness ${id} is excluded because it contains more than 1 "date" tag`);
          break;
      }
    }

    this.#witnesses.push({ id: '1997', enabled: true, content: 'Meridiani 1997', start: this.#parseDate('1997'), xml: this.#generateTei(this.#xml, '', true)});

    this.#validateTei();
  }

  async #initializeManuscript() {
    const txt = await fetch("data/lacamera_manoscritto.xml").then(r => r.text());

    const parser = new DOMParser();
    const xml = parser.parseFromString(txt,"text/xml");

    const id="manoscritto";

    this.#witnesses.push({ id, enabled: true, content: 'manoscritto', start: this.#parseDate('1234'), xml: this.#generateTei(xml, id, false)});

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
          console.error(`rdg validation: Unable to find wit with ID ${witId}`);
        }
      }
    });
  }

  populateWitnesses() {
    this.#enabledWitnesses.forEach(witness => {
      for (const a of [this.#selectWitnessesA, this.#selectWitnessesB]) {
        const o = document.createElement("option");
        o.textContent = witness.content;
        o.value = witness.id;
        a.appendChild(o);
      }
    });

    this.#selectWitnessesA.value = this.#enabledWitnesses[0].id;
    this.#selectWitnessesB.value = this.#enabledWitnesses[0].id;

    this.#compareWitness();
  }

  #compareWitness() {
    const a = this.#enabledWitnesses.find(a => a.id === this.#selectWitnessesA.value).xml;
    const b = this.#enabledWitnesses.find(a => a.id === this.#selectWitnessesB.value).xml;

    this.#teiA.innerHTML = b.replace(/\n/g, '<br />');
    this.#renderDiff(Diff.diffWords(a,b));
    this.#teiB.innerHTML = a.replace(/\n/g, '<br />');
  }

  #renderDiff(diff) {
    const blocks = [];

    diff.forEach(a => {
      if (a.added) {
        blocks.push(`<span class="removed">${a.value}</span>`.replace(/\n/g, '<br />'));
        return;
      }

      if (a.removed) {
        blocks.push(`<span class="added">${a.value}</span>`.replace(/\n/g, '<br />'));
        return;
      }

      blocks.push(`<span class="eq">${a.value}</span>`.replace(/\n/g, '<br />'));
    });
     
    this.#tei.innerHTML = blocks.join('');
  }

  #generateTei(parentXml, witId, forceLem) {
    // 0. clone the XML
    const xml = this.#cloneXml(parentXml);

    // 1. trim the XML
    this.#trimXml(xml, witId);

    // 2. drop app nodes
    this.#dropAppNodes(xml, witId, forceLem);

    // 3. prettier XML
    return this.#filterXML(xml);
  }

  #cloneXml(parentXml) {
    const xml = parentXml.implementation.createDocument(parentXml.namespaceURI, null, null);
    xml.appendChild(xml.importNode(parentXml.documentElement, true));
    return xml;
  }

  #filterXML(xml) {
    [...xml.getElementsByTagName('note')].forEach(a => a.remove());
    return [...xml.getElementsByTagName('l')].map(l => l.textContent.replace(/\n/g, ' ').replace(/ +(?= )/g,'').trim()).join('\n')
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

      if (forceLem || rdgs.length === 0) {
        const lems = [...app.getElementsByTagName("lem")];
        if (lems.length > 1) {
          console.warn(`Too many "lem" for wit ${id}`);
        }

        if (lems.length) {
          while (lems[0].firstChild) {
            app.before(lems[0].firstChild);
          }
        }
      } else {
        while (rdgs[0].firstChild) {
          app.before(rdgs[0].firstChild);
        }
      }

      app.remove();
    }
  }

  #displayXml(xml, where) {
    where.textContent = xml;
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
});
