const {
  input,
  div,
  text,
  script,
  domReady,
  style,
  button,
} = require("@saltcorn/markup/tags");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const Field = require("@saltcorn/data/models/field");
const db = require("@saltcorn/data/db");
const { stateFieldsToWhere } = require("@saltcorn/data/plugin-helper");

const configuration_workflow = () =>
  new Workflow({
    steps: [
      {
        name: "views",
        form: async (context) => {
          const table = await Table.findOne({ id: context.table_id });
          const fields = await table.getFields();
          const show_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewtemplate, viewrow }) =>
              viewtemplate.renderRows &&
              viewrow.name !== context.viewname &&
              state_fields.some((sf) => sf.name === "id")
          );
          const show_view_opts = show_views.map((v) => v.name);
          fields.push({ name: "id" });
          return new Form({
            fields: [
              {
                name: "show_view",
                label: "Item View",
                type: "String",
                required: true,
                attributes: {
                  options: show_view_opts.join(),
                },
              },
              {
                name: "order_field",
                label: "Order by",
                type: "String",
                required: true,
                attributes: {
                  options: fields.map((f) => f.name).join(),
                },
              },
              {
                name: "descending",
                label: "Descending",
                type: "Bool",
                required: true,
              },
            ],
          });
        },
      },
    ],
  });

const get_state_fields = async (table_id, viewname, { show_view }) => {
  const table_fields = await Field.find({ table_id });
  return table_fields.map((f) => {
    const sf = new Field(f);
    sf.required = false;
    return sf;
  });
};

const run = async (
  table_id,
  viewname,
  { show_view, order_field, descending },
  all_state,
  extraArgs
) => {
  const id = `map${Math.round(Math.random() * 100000)}`;
  const { _after, _before, ...state } = all_state;
  const tbl = await Table.findOne({ id: table_id });
  const fields = await tbl.getFields();
  const qstate = await stateFieldsToWhere({ fields, state });
  const nrows = await tbl.countRows(qstate);
  var offset;

  if (typeof _after !== "undefined") {
    offset = +_after + 1;
  } else if (typeof _before !== "undefined") {
    offset = +_before - 1;
  } else offset = 0;
  var hasNext = offset < nrows - 1;
  var hasPrev = offset > 0;
  const fetchedRows = await tbl.getRows(qstate, {
    orderBy: order_field,
    ...(descending && { orderDesc: true }),
    limit: 1,
    offset,
  });

  const showview = await View.findOne({ name: show_view });
  const rendered = await showview.viewtemplateObj.renderRows(
    tbl,
    showview.name,
    showview.configuration,
    extraArgs,
    fetchedRows
  );

  return div(
    rendered.length > 0 ? rendered[0] : "Nothing to see here",
    div(
      { class: "d-flex justify-content-between" },

      button(
        {
          disabled: !hasPrev,
          class: "btn btn-secondary",
          onClick: `stepper_prev(${offset})`,
        },
        "&laquo Previous"
      ),
      div(`${offset + 1} / ${nrows}`),
      button(
        {
          disabled: !hasNext,
          class: "btn btn-secondary",
          onClick: `stepper_next(${offset})`,
        },
        "Next &raquo"
      )
    ),
    script(`
    function stepper_next(offset) {
      window.location.href = updateQueryStringParameter(
        removeQueryStringParameter(window.location.href, '_before'),
        '_after',
        offset
      );
    }
    function stepper_prev(offset) {
      window.location.href = updateQueryStringParameter(
        removeQueryStringParameter(window.location.href, '_after'),
        '_before',
        offset
      );
    }
    
    `)
  );
};

module.exports = {
  sc_plugin_api_version: 1,
  viewtemplates: [
    {
      name: "Stepper",
      display_state_form: false,
      get_state_fields,
      configuration_workflow,
      run,
    },
  ],
};
