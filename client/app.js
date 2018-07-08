/*
import hyper from 'hyperhtml';

let state = 0;

const actions = {
  inc() { render(state++); },
  dec() { render(state--); },
};

function render(state) {
  hyper(document.body)`
<body>
  <h1>${state}</h1>
  <button onclick=${actions.inc}>^</button>
  <button onclick=${actions.dec}>v</button>
</body>
`;
}

render(state);
*/