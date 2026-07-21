from langchain.tools import tool


@tool
def ask_user_question(questions: list[dict]) -> None:
    """Collect structured multiple-choice answers from the user.

    Collect structured multiple-choice answers from the user. Use only when
    blocked on a decision that is genuinely the user's to make — one you cannot
    resolve from the request, the code, or sensible defaults. Each question must
    have at least 2 options; users can always select "Other" for custom text. Set
    multi_select to true for multi-select questions.

    Args:
        questions: A list of 1-4 parallel, independent questions with predefined
            answer choices. Each question is a dict with:
            - question (str): Full question text. Be specific and end with a
              question mark where appropriate.
            - header (str): Very short tab or tag label for the question, maximum
              12 characters, for example Auth or Library.
            - options (list[dict]): A list of 2-4 distinct selectable choices.
              Choices are mutually exclusive unless multi_select is true. Each
              option is a dict with:
                - label (str): Short display label for this choice, ideally 1-5
                  words.
                - description (str): Explanation of what this choice means or
                  implies.
                - preview (str, optional): Optional markdown preview shown when
                  this option is focused. Intended for single-select questions
                  only.
            - multi_select (bool): If true, the user may select multiple options.
              If false, the user must select exactly one option.

    Raises:
        RuntimeError: Always. Its answer must come from a human, so this tool can
            never be executed automatically.
    """
    # This tool always terminates the run to wait for a human answer: its answer
    # must come from a human, so it can never be auto-executed.
    raise RuntimeError(
        "ask_user_question needs a human answer and cannot be executed automatically."
    )
