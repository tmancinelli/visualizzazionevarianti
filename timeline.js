class LaCamera {
  #xml;
  #witnesses;
  #enabledWitnesses;

  constructor() {
    this.#witnesses = [];
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

    this.#witnesses.sort((a, b) => a.start > b.start);
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
          console.error(`rdg validation: Unable to find wit with ID ${witId}`);
        }
      }
    });
  }

  createTimeline() {
    const timeline = new vis.Timeline(document.getElementById("timeline"), new vis.DataSet(this.#enabledWitnesses), {
      height: '100%',
    });

    timeline.setSelection(this.#enabledWitnesses[0].id);
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
  i.createTimeline();
});
