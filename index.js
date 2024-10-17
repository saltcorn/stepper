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
              (viewtemplate.runMany || viewtemplate.renderRows) &&
              viewrow.name !== context.viewname &&
              state_fields.some((sf) => sf.primary_key || sf.name === "id")
          );
          const show_view_opts = show_views.map((v) => v.name);
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

const count_rows_query_impl = async (table_id, state) => {
  const tbl = await Table.findOne({ id: table_id });
  const fields = await tbl.getFields();
  const qstate = await stateFieldsToWhere({ fields, state });
  return await tbl.countRows(qstate);
};

const run = async (
  table_id,
  viewname,
  { show_view, order_field, descending },
  all_state,
  extraArgs,
  queriesObj
) => {
  const id = `map${Math.round(Math.random() * 100000)}`;
  const { _offset, ...state } = all_state;

  const nrows = queriesObj?.count_rows_query
    ? await queriesObj.count_rows_query(state)
    : await count_rows_query_impl(table_id, state);
  const offset = typeof _offset === "undefined" ? 0 : +_offset;
  const hasNext = offset < nrows - 1;
  const hasPrev = offset > 0;

  const showview = await View.findOne({ name: show_view });
  if (!showview)
    return div(
      { class: "alert alert-danger" },
      "Stepper incorrectly configured. Cannot find view: ",
      show_view
    );

  const sresps = await showview.runMany(state, {
    ...extraArgs,
    orderBy: order_field,
    ...(descending && { orderDesc: true }),
    limit: 1,
    offset,
  });

  return div(
    sresps.length > 0 ? sresps[0].html : "Nothing to see here",
    div(
      { class: "d-flex justify-content-between" },

      button(
        {
          disabled: !hasPrev,
          class: "btn btn-secondary",
          onClick: `set_state_field('_offset',${offset - 1})`,
        },
        "&laquo Previous"
      ),
      div(`${offset + 1} / ${nrows}`),
      button(
        {
          disabled: !hasNext,
          class: "btn btn-secondary",
          onClick: `set_state_field('_offset',${offset + 1})`,
        },
        "Next &raquo"
      )
    )
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
      queries: ({ table_id, name, configuration, req, res }) => ({
        async count_rows_query(state) {
          return await count_rows_query_impl(table_id, state);
        },
      }),
    },
    require("./nextprevlinks"),
  ],
  ready_for_mobile: true,
};
